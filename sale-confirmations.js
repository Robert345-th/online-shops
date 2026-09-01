const express = require('express');
const router = express.Router();
const pool = require('./db');
const requireAuth = require('./middleware');
const { sendPushNotification } = require('./notifications');

let soldAtReady = null;
async function ensureSoldAtColumn() {
  if (!soldAtReady) {
    soldAtReady = pool
      .query(`ALTER TABLE pool6.listings ADD COLUMN IF NOT EXISTS sold_at TIMESTAMPTZ`)
      .catch((err) => {
        soldAtReady = null;
        throw err;
      });
  }
  await soldAtReady;
}

// GET - recent people the seller has chatted with (to pick who the buyer was)
router.get('/recent-contacts', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT u.id, u.name
       FROM pool6.messages m
       JOIN pool6.users u ON u.id = CASE WHEN m.sender_id = $1 THEN m.receiver_id ELSE m.sender_id END
       WHERE m.sender_id = $1 OR m.receiver_id = $1
       ORDER BY u.name ASC`,
      [req.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load contacts.' });
  }
});

// POST - seller requests buyer confirmation for a sale (by buyer_id OR buyer_phone)
router.post('/', requireAuth, async (req, res) => {
  const { buyer_id, buyer_phone, listing_title } = req.body;

  if (!listing_title) {
    return res.status(400).json({ error: 'Listing title is required.' });
  }

  if (!buyer_id && !buyer_phone) {
    return res.status(400).json({ error: 'A buyer must be selected or a phone number entered.' });
  }

  try {
    let resolvedBuyerId = buyer_id;

    if (!resolvedBuyerId && buyer_phone) {
      const phoneCheck = await pool.query('SELECT id FROM pool6.users WHERE phone = $1', [buyer_phone]);
      if (phoneCheck.rows.length === 0) {
        return res.status(404).json({ error: 'No ZedMarket account found with that phone number.' });
      }
      resolvedBuyerId = phoneCheck.rows[0].id;
    }

    if (parseInt(resolvedBuyerId) === req.userId) {
      return res.status(400).json({ error: 'You cannot confirm a sale with yourself.' });
    }

    const existingPending = await pool.query(
      `SELECT id FROM pool6.sale_confirmations
       WHERE seller_id = $1 AND buyer_id = $2 AND status = 'pending'`,
      [req.userId, resolvedBuyerId]
    );

    if (existingPending.rows.length > 0) {
      return res.status(400).json({ error: 'A confirmation request is already pending with this buyer.' });
    }

    const result = await pool.query(
      `INSERT INTO pool6.sale_confirmations (listing_title, seller_id, buyer_id)
       VALUES ($1, $2, $3) RETURNING *`,
      [listing_title, req.userId, resolvedBuyerId]
    );

    const sellerResult = await pool.query('SELECT name, shop_name FROM pool6.users WHERE id = $1', [req.userId]);
    const sellerName = sellerResult.rows[0]?.shop_name || sellerResult.rows[0]?.name || 'A seller';

    sendPushNotification(
      resolvedBuyerId,
      '✅ Confirm Your Purchase',
      `Did you buy "${listing_title}" from ${sellerName}? Please confirm in the app.`,
      { type: 'sale_confirmation', url: '/sale-confirmations.html' }
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not request confirmation.' });
  }
});

// GET - count of pending purchase confirmations (buyer)
router.get('/pending-count', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM pool6.sale_confirmations
       WHERE buyer_id = $1 AND status = 'pending'`,
      [req.userId]
    );
    res.json({ count: result.rows[0]?.count || 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load confirmation count.' });
  }
});

// GET - public sold history for a seller profile (sold listings + confirmed sales)
router.get('/seller/:sellerId/history', async (req, res) => {
  try {
    await ensureSoldAtColumn();
    const [listingSold, confirmed] = await Promise.all([
      pool.query(
        `SELECT l.id AS listing_id, l.title AS listing_title, l.price, l.photos,
                COALESCE(l.sold_at, l.date_posted) AS sold_at, l.location_label
         FROM pool6.listings l
         WHERE l.seller_id = $1 AND l.status = 'sold'
         ORDER BY COALESCE(l.sold_at, l.date_posted) DESC
         LIMIT 30`,
        [req.params.sellerId]
      ),
      pool.query(
        `SELECT listing_title, confirmed_at AS sold_at
         FROM pool6.sale_confirmations
         WHERE seller_id = $1 AND status = 'confirmed'
         ORDER BY confirmed_at DESC
         LIMIT 30`,
        [req.params.sellerId]
      ),
    ]);

    const titles = new Set(
      listingSold.rows.map((row) => String(row.listing_title || '').trim().toLowerCase())
    );
    const extra = confirmed.rows
      .filter((row) => !titles.has(String(row.listing_title || '').trim().toLowerCase()))
      .map((row) => ({
        listing_id: null,
        listing_title: row.listing_title,
        price: null,
        photos: null,
        sold_at: row.sold_at,
        location_label: null,
      }));

    const merged = listingSold.rows.concat(extra)
      .sort((a, b) => new Date(b.sold_at) - new Date(a.sold_at))
      .slice(0, 30);
    res.json(merged);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load sold history.' });
  }
});

// GET - pending confirmations waiting on me (as the buyer)
router.get('/pending', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT sc.id, sc.listing_title, sc.requested_at, u.name AS seller_name, u.shop_name
       FROM pool6.sale_confirmations sc
       JOIN pool6.users u ON sc.seller_id = u.id
       WHERE sc.buyer_id = $1 AND sc.status = 'pending'
       ORDER BY sc.requested_at DESC`,
      [req.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load pending confirmations.' });
  }
});

// PUT - buyer confirms the sale actually happened
router.put('/:id/confirm', requireAuth, async (req, res) => {
  try {
    const check = await pool.query(
      `SELECT * FROM pool6.sale_confirmations WHERE id = $1 AND buyer_id = $2 AND status = 'pending'`,
      [req.params.id, req.userId]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Confirmation request not found.' });
    }

    const confirmation = check.rows[0];

    await pool.query(
      `UPDATE pool6.sale_confirmations SET status = 'confirmed', confirmed_at = NOW() WHERE id = $1`,
      [req.params.id]
    );

    await pool.query('UPDATE pool6.users SET total_sold = total_sold + 1 WHERE id = $1', [confirmation.seller_id]);

    sendPushNotification(
      confirmation.seller_id,
      '✅ Sale Confirmed!',
      `The buyer confirmed your sale of "${confirmation.listing_title}". It now counts toward your trust badge.`
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not confirm sale.' });
  }
});

// PUT - buyer denies the sale request
router.put('/:id/deny', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE pool6.sale_confirmations SET status = 'denied' WHERE id = $1 AND buyer_id = $2 RETURNING *`,
      [req.params.id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Confirmation request not found.' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not deny confirmation.' });
  }
});

module.exports = router;

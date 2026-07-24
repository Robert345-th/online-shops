const express = require('express');
const router = express.Router();
const pool = require('./db');
const requireAuth = require('./middleware');
const requireAdmin = require('./requireAdmin');
const { sendPushNotification } = require('./notifications');

// GET - check how many free boost credits I have (from referrals)
router.get('/my-credits', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT free_boost_credits FROM pool6.users WHERE id = $1', [req.userId]);
    res.json({ free_boost_credits: result.rows[0]?.free_boost_credits || 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load your boost credits.' });
  }
});

// POST - seller requests a boost. If they have a free credit (from referrals), it's applied instantly.
// Otherwise, it goes through the normal review flow (free during launch, or paid once announced).
router.post('/:listingId', requireAuth, async (req, res) => {
  const { transaction_ref, use_credit } = req.body;

  try {
    const listingCheck = await pool.query(
      'SELECT seller_id, title FROM pool6.listings WHERE id = $1',
      [req.params.listingId]
    );

    if (listingCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Listing not found.' });
    }

    if (listingCheck.rows[0].seller_id !== req.userId) {
      return res.status(403).json({ error: 'You can only boost your own listings.' });
    }

    if (use_credit) {
      const creditCheck = await pool.query('SELECT free_boost_credits FROM pool6.users WHERE id = $1', [req.userId]);
      const credits = creditCheck.rows[0]?.free_boost_credits || 0;

      if (credits <= 0) {
        return res.status(400).json({ error: "You don't have any free Boost credits." });
      }

      await pool.query('UPDATE pool6.users SET free_boost_credits = free_boost_credits - 1 WHERE id = $1', [req.userId]);

      const boostedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await pool.query('UPDATE pool6.listings SET boosted_until = $1 WHERE id = $2', [boostedUntil, req.params.listingId]);

      return res.status(201).json({ success: true, usedCredit: true, boosted_until: boostedUntil });
    }

    const existingCheck = await pool.query(
      `SELECT 1 FROM pool6.boost_requests WHERE listing_id = $1 AND status = 'pending'`,
      [req.params.listingId]
    );
    if (existingCheck.rows.length > 0) {
      return res.status(400).json({ error: 'This listing already has a pending boost request.' });
    }

    const result = await pool.query(
      `INSERT INTO pool6.boost_requests (listing_id, user_id, transaction_ref)
       VALUES ($1, $2, $3) RETURNING *`,
      [req.params.listingId, req.userId, transaction_ref || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not submit boost request.' });
  }
});

// GET - admin: list all pending boost requests
router.get('/pending', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT br.id, br.transaction_ref, br.requested_at, l.id AS listing_id, l.title, u.name AS user_name, u.phone AS user_phone
       FROM pool6.boost_requests br
       JOIN pool6.listings l ON br.listing_id = l.id
       JOIN pool6.users u ON br.user_id = u.id
       WHERE br.status = 'pending'
       ORDER BY br.requested_at ASC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load boost requests.' });
  }
});

// PUT - admin: approve a boost request
router.put('/:id/approve', requireAuth, requireAdmin, async (req, res) => {
  try {
    const boostResult = await pool.query(
      `UPDATE pool6.boost_requests SET status = 'approved' WHERE id = $1 RETURNING *`,
      [req.params.id]
    );

    if (boostResult.rows.length === 0) {
      return res.status(404).json({ error: 'Boost request not found.' });
    }

    const boost = boostResult.rows[0];
    const boostedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await pool.query(
      `UPDATE pool6.listings SET boosted_until = $1 WHERE id = $2`,
      [boostedUntil, boost.listing_id]
    );

    sendPushNotification(
      boost.user_id,
      '🚀 Listing Boosted!',
      'Your listing is now at the top of the feed for the next 24 hours.'
    );

    res.json({ success: true, boosted_until: boostedUntil });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not approve boost request.' });
  }
});

// PUT - admin: reject a boost request
router.put('/:id/reject', requireAuth, requireAdmin, async (req, res) => {
  try {
    await pool.query(`UPDATE pool6.boost_requests SET status = 'rejected' WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not reject boost request.' });
  }
});

module.exports = router;

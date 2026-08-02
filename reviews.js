const express = require('express');
const router = express.Router();
const pool = require('./db');
const requireAuth = require('./middleware');
const { sendPushNotification } = require('./notifications');

// GET all reviews for a specific seller
router.get('/seller/:sellerId', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.id, r.rating, r.comment, r.date_posted, u.name AS reviewer_name
       FROM pool6.reviews r
       JOIN pool6.users u ON r.reviewer_id = u.id
       WHERE r.seller_id = $1
       ORDER BY r.date_posted DESC`,
      [req.params.sellerId]
    );

    const avgResult = await pool.query(
      `SELECT ROUND(AVG(rating), 1) AS average, COUNT(*) AS total
       FROM pool6.reviews WHERE seller_id = $1`,
      [req.params.sellerId]
    );

    res.json({
      reviews: result.rows,
      average: avgResult.rows[0].average || 0,
      total: parseInt(avgResult.rows[0].total),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load reviews.' });
  }
});

// GET full seller profile - name, shop name, sold count, trust badge, rating summary
router.get('/seller/:sellerId/profile', async (req, res) => {
  try {
    const userResult = await pool.query(
      `SELECT id, name, shop_name, account_type, total_sold, date_joined, nrc_verified
       FROM pool6.users WHERE id = $1`,
      [req.params.sellerId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Seller not found.' });
    }

    const seller = userResult.rows[0];

    const avgResult = await pool.query(
      `SELECT ROUND(AVG(rating), 1) AS average, COUNT(*) AS total
       FROM pool6.reviews WHERE seller_id = $1`,
      [req.params.sellerId]
    );

    const activeListingsResult = await pool.query(
      `SELECT COUNT(*) FROM pool6.listings WHERE seller_id = $1 AND status = 'active'`,
      [req.params.sellerId]
    );

    let badge = null;
    if (seller.total_sold >= 100) {
      badge = { emoji: '🏆', label: 'Elite Seller' };
    } else if (seller.total_sold >= 50) {
      badge = { emoji: '🌟', label: 'Trusted Seller' };
    }

    res.json({
      id: seller.id,
      name: seller.name,
      shop_name: seller.shop_name,
      display_name: seller.shop_name || seller.name,
      account_type: seller.account_type,
      nrc_verified: seller.nrc_verified === true,
      total_sold: seller.total_sold || 0,
      active_listings: parseInt(activeListingsResult.rows[0].count),
      average_rating: avgResult.rows[0].average || 0,
      total_reviews: parseInt(avgResult.rows[0].total),
      member_since: seller.date_joined,
      badge,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load seller profile.' });
  }
});

// GET leaderboard - top rated sellers (needs at least 1 review, ranked by average then count)
router.get('/leaderboard', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.shop_name, u.account_type,
              ROUND(AVG(r.rating), 1) AS average,
              COUNT(r.id) AS total
       FROM pool6.reviews r
       JOIN pool6.users u ON r.seller_id = u.id
       WHERE (u.is_deleted = false OR u.is_deleted IS NULL)
       AND (u.is_suspended = false OR u.is_suspended IS NULL)
       GROUP BY u.id, u.name, u.shop_name, u.account_type
       HAVING COUNT(r.id) >= 1
       ORDER BY average DESC, total DESC
       LIMIT 10`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load leaderboard.' });
  }
});

// POST - leave a review for a seller
router.post('/seller/:sellerId', requireAuth, async (req, res) => {
  const { rating, comment } = req.body;

  if (!rating || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Rating must be between 1 and 5.' });
  }

  if (parseInt(req.params.sellerId) === req.userId) {
    return res.status(400).json({ error: 'You cannot review yourself.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO pool6.reviews (seller_id, reviewer_id, rating, comment)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (seller_id, reviewer_id) DO UPDATE SET rating = $3, comment = $4, date_posted = NOW()
       RETURNING *`,
      [req.params.sellerId, req.userId, rating, comment]
    );

    sendPushNotification(
      req.params.sellerId,
      'New Review! ⭐',
      `You received a ${rating}-star review.`
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not submit review.' });
  }
});

module.exports = router;

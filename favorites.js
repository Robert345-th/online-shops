const express = require('express');
const router = express.Router();
const pool = require('./db');
const requireAuth = require('./middleware');
const { sendPushNotification } = require('./notifications');

// GET - my favorited listings
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT l.id, l.title, l.price, l.compare_at_price, COALESCE(l.photos[1:1], '{}') AS photos, l.video_url, l.status, l.date_posted, l.location_label,
              c.name AS category
       FROM pool6.favorites f
       JOIN pool6.listings l ON f.listing_id = l.id
       LEFT JOIN pool6.categories c ON l.category_id = c.id
       WHERE f.user_id = $1 AND l.status IN ('active', 'reserved')
       ORDER BY f.id DESC`,
      [req.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load favorites.' });
  }
});

// POST - favorite a listing
router.post('/:listingId', requireAuth, async (req, res) => {
  try {
    await pool.query(
      `INSERT INTO pool6.favorites (user_id, listing_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [req.userId, req.params.listingId]
    );

    const listingResult = await pool.query(
      'SELECT seller_id, title FROM pool6.listings WHERE id = $1',
      [req.params.listingId]
    );

    if (listingResult.rows.length > 0 && listingResult.rows[0].seller_id !== req.userId) {
      sendPushNotification(
        listingResult.rows[0].seller_id,
        '❤️ New Favorite!',
        `Someone favorited your listing "${listingResult.rows[0].title}".`
      );
    }

    res.status(201).json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not favorite listing.' });
  }
});

// DELETE - unfavorite a listing
router.delete('/:listingId', requireAuth, async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM pool6.favorites WHERE user_id = $1 AND listing_id = $2`,
      [req.userId, req.params.listingId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not unfavorite listing.' });
  }
});

module.exports = router;

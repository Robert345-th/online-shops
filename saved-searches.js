const express = require('express');
const router = express.Router();
const pool = require('./db');
const requireAuth = require('./middleware');
const { ensureMarketplaceTables } = require('./marketplace-extras');

const MAX_SEARCHES = 8;

function cleanText(value, max) {
  const text = String(value || '').trim().slice(0, max);
  return text;
}

router.get('/', requireAuth, async (req, res) => {
  try {
    await ensureMarketplaceTables();
    const result = await pool.query(
      `SELECT id, query, category, city, max_price, created_at
       FROM pool6.saved_searches WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load saved searches.' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  const query = cleanText(req.body.query, 80);
  const category = cleanText(req.body.category, 40) || 'All';
  const city = cleanText(req.body.city, 60);
  const maxPriceRaw = parseFloat(req.body.max_price);
  const maxPrice = Number.isFinite(maxPriceRaw) && maxPriceRaw > 0 ? maxPriceRaw : null;

  if (!query && (!category || category === 'All') && !city && !maxPrice) {
    return res.status(400).json({ error: 'Add a search, category, city, or max price first.' });
  }

  try {
    await ensureMarketplaceTables();
    const count = await pool.query(
      'SELECT COUNT(*)::int AS n FROM pool6.saved_searches WHERE user_id = $1',
      [req.userId]
    );
    if ((count.rows[0]?.n || 0) >= MAX_SEARCHES) {
      return res.status(400).json({ error: 'You can save up to 8 searches. Delete one to add another.' });
    }

    const dup = await pool.query(
      `SELECT id FROM pool6.saved_searches
       WHERE user_id = $1
         AND COALESCE(query, '') = $2
         AND COALESCE(category, 'All') = $3
         AND COALESCE(city, '') = $4
         AND COALESCE(max_price, 0) = COALESCE($5, 0)
       LIMIT 1`,
      [req.userId, query, category, city, maxPrice]
    );
    if (dup.rows.length) {
      return res.json(dup.rows[0]);
    }

    const result = await pool.query(
      `INSERT INTO pool6.saved_searches (user_id, query, category, city, max_price)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, query, category, city, max_price, created_at`,
      [req.userId, query, category, city, maxPrice]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not save this search.' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await ensureMarketplaceTables();
    const result = await pool.query(
      'DELETE FROM pool6.saved_searches WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.userId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Search not found.' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not delete this search.' });
  }
});

module.exports = router;

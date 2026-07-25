const express = require('express');
const router = express.Router();
const pool = require('./db');
const requireAuth = require('./middleware');

// GET - public feed of open "wanted" posts
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT w.id, w.title, w.description, w.budget, w.location_label, w.date_posted,
              w.user_id, c.name AS category, u.name AS poster_name
       FROM pool6.wanted_posts w
       LEFT JOIN pool6.categories c ON w.category_id = c.id
       JOIN pool6.users u ON w.user_id = u.id
       WHERE w.status = 'open'
       ORDER BY w.date_posted DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load wanted posts.' });
  }
});

// GET - my own wanted posts (open and closed)
router.get('/mine', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT w.id, w.title, w.description, w.budget, w.location_label, w.date_posted, w.status,
              c.name AS category
       FROM pool6.wanted_posts w
       LEFT JOIN pool6.categories c ON w.category_id = c.id
       WHERE w.user_id = $1
       ORDER BY w.date_posted DESC`,
      [req.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load your wanted posts.' });
  }
});

// POST - create a new "wanted" post (any logged-in user, buyer or shop)
router.post('/', requireAuth, async (req, res) => {
  const { title, description, category_id, budget, location_label } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Please describe what you are looking for.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO pool6.wanted_posts (user_id, title, description, category_id, budget, location_label)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [req.userId, title.trim(), description || null, category_id || null, budget || null, location_label || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not create wanted post.' });
  }
});

// PUT - mark a wanted post as fulfilled/closed (owner only)
router.put('/:id/close', requireAuth, async (req, res) => {
  try {
    const check = await pool.query('SELECT user_id FROM pool6.wanted_posts WHERE id = $1', [req.params.id]);

    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found.' });
    }

    if (check.rows[0].user_id !== req.userId) {
      return res.status(403).json({ error: 'You can only close your own posts.' });
    }

    await pool.query(`UPDATE pool6.wanted_posts SET status = 'closed' WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not close post.' });
  }
});

// DELETE - remove a wanted post (owner only)
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const check = await pool.query('SELECT user_id FROM pool6.wanted_posts WHERE id = $1', [req.params.id]);

    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found.' });
    }

    if (check.rows[0].user_id !== req.userId) {
      return res.status(403).json({ error: 'You can only delete your own posts.' });
    }

    await pool.query('DELETE FROM pool6.wanted_posts WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not delete post.' });
  }
});

module.exports = router;

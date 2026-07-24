const express = require('express');
const router = express.Router();
const pool = require('./db');
const requireAuth = require('./middleware');
const requireAdmin = require('./requireAdmin');

// POST - report a user by phone number (buyer or seller)
router.post('/', requireAuth, async (req, res) => {
  const { reported_phone, reported_role, reason } = req.body;

  if (!reported_phone || !reported_role || !reason) {
    return res.status(400).json({ error: 'Phone number, role, and reason are all required.' });
  }

  try {
    await pool.query(
      `INSERT INTO pool6.user_reports (reported_phone, reported_role, reason, reported_by, date, status)
       VALUES ($1, $2, $3, $4, NOW(), 'pending')`,
      [reported_phone, reported_role, reason, req.userId]
    );
    res.status(201).json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not submit report.' });
  }
});

// GET - admin: list all pending user reports, with matched account info if found
router.get('/pending', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ur.id, ur.reported_phone, ur.reported_role, ur.reason, ur.date, ur.status,
              u.name AS reporter_name,
              matched.id AS matched_user_id,
              matched.is_suspended AS matched_user_suspended
       FROM pool6.user_reports ur
       LEFT JOIN pool6.users u ON ur.reported_by = u.id
       LEFT JOIN pool6.users matched ON matched.phone = ur.reported_phone
       WHERE ur.status = 'pending'
       ORDER BY ur.date DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load user reports.' });
  }
});

// PUT - admin: dismiss a user report
router.put('/:id/dismiss', requireAuth, requireAdmin, async (req, res) => {
  try {
    await pool.query(`UPDATE pool6.user_reports SET status = 'dismissed' WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not dismiss report.' });
  }
});

module.exports = router;

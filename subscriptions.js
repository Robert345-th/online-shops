const express = require('express');
const router = express.Router();
const pool = require('./db');
const requireAuth = require('./middleware');
const requireAdmin = require('./requireAdmin');
const { sendPushNotification } = require('./notifications');

// POST - request a subscription (seller submits transaction ref)
router.post('/', requireAuth, async (req, res) => {
  const { category, transaction_ref } = req.body;

  if (!category || !transaction_ref) {
    return res.status(400).json({ error: 'Category and transaction reference are required.' });
  }

  try {
    const priceResult = await pool.query(
      'SELECT price FROM pool6.plan_prices WHERE category = $1',
      [category]
    );

    if (priceResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid category.' });
    }

    const price = priceResult.rows[0].price;

    const result = await pool.query(
      `INSERT INTO pool6.subscriptions
        (user_id, category, plan_type, price, payment_status, transaction_ref)
       VALUES ($1, $2, 'monthly', $3, 'pending', $4)
       RETURNING *`,
      [req.userId, category, price, transaction_ref]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not submit subscription request.' });
  }
});

// GET - check my own subscription status
router.get('/mine', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM pool6.subscriptions
       WHERE user_id = $1
       ORDER BY start_date DESC
       LIMIT 1`,
      [req.userId]
    );
    res.json(result.rows[0] || null);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load subscription status.' });
  }
});

// GET - admin: list all pending subscription requests
router.get('/pending', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.*, u.name AS user_name, u.phone AS user_phone
       FROM pool6.subscriptions s
       JOIN pool6.users u ON s.user_id = u.id
       WHERE s.payment_status = 'pending'
       ORDER BY s.start_date ASC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load pending subscriptions.' });
  }
});

// PUT - admin: approve a subscription
router.put('/:id/approve', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE pool6.subscriptions
       SET payment_status = 'active', end_date = NOW() + INTERVAL '30 days'
       WHERE id = $1
       RETURNING *`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Subscription not found.' });
    }

    await pool.query(
      `UPDATE pool6.users SET account_type = 'shop' WHERE id = $1`,
      [result.rows[0].user_id]
    );

    sendPushNotification(
      result.rows[0].user_id,
      'Shop Approved! 🏆',
      `Your ${result.rows[0].category} shop subscription is now active.`
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not approve subscription.' });
  }
});

// PUT - admin: reject a subscription
router.put('/:id/reject', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE pool6.subscriptions SET payment_status = 'rejected' WHERE id = $1 RETURNING *`,
      [req.params.id]
    );

    if (result.rows.length > 0) {
      sendPushNotification(
        result.rows[0].user_id,
        'Subscription Request Declined',
        'Your shop subscription request was not approved. Please check your payment details and try again.'
      );
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not reject subscription.' });
  }
});

module.exports = router;

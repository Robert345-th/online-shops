const express = require('express');
const router = express.Router();
const pool = require('./db');

// GET - public: current payment enforcement status
router.get('/payment-status', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT grace_period_end, warning_message FROM pool6.app_settings WHERE id = 1'
    );

    const settings = result.rows[0];
    const gracePeriodEnd = settings?.grace_period_end;
    const enforced = !!gracePeriodEnd;
    const gracePeriodPassed = enforced && new Date() > new Date(gracePeriodEnd);

    res.json({
      enforced,
      grace_period_end: gracePeriodEnd,
      grace_period_passed: gracePeriodPassed,
      warning_message: settings?.warning_message || null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load payment status.' });
  }
});

// GET - public: current subscription plan prices, keyed by category
router.get('/plan-prices', async (req, res) => {
  try {
    const result = await pool.query('SELECT category, price FROM pool6.plan_prices');
    const prices = {};
    result.rows.forEach((row) => {
      prices[row.category] = row.price;
    });
    res.json(prices);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load plan prices.' });
  }
});

module.exports = router;

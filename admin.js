const express = require('express');
const router = express.Router();
const pool = require('./db');
const requireAuth = require('./middleware');
const requireAdmin = require('./requireAdmin');
const { sendPushNotification } = require('./notifications');
const { NRC_GRACE_DAYS } = require('./shop-verification');

// GET - public: find the support/admin contact for chat
router.get('/support-contact', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name FROM pool6.users WHERE is_admin = true ORDER BY id ASC LIMIT 1`
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No support contact available.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load support contact.' });
  }
});

// GET - list verified users only (admin only)
router.get('/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, phone, account_type, is_suspended, date_joined, phone_verified
       FROM pool6.users
       WHERE phone_verified = true
       AND (is_deleted = false OR is_deleted IS NULL)
       ORDER BY date_joined DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load users.' });
  }
});

// PUT - suspend a user
router.put('/users/:id/suspend', requireAuth, requireAdmin, async (req, res) => {
  try {
    await pool.query('UPDATE pool6.users SET is_suspended = true WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not suspend user.' });
  }
});

// PUT - unsuspend a user
router.put('/users/:id/unsuspend', requireAuth, requireAdmin, async (req, res) => {
  try {
    await pool.query('UPDATE pool6.users SET is_suspended = false WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not unsuspend user.' });
  }
});

// GET - admin: list all pending shop verification applications
router.get('/shop-applications/pending', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, phone, shop_name, date_of_birth, city, province, selling_type,
              shop_address, home_address, shop_location_label, home_location_label, location_label,
              date_joined
       FROM pool6.users
       WHERE shop_status = 'pending'
       ORDER BY date_joined ASC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load shop applications.' });
  }
});

// PUT - admin: approve a shop application. If this person was referred by someone,
// both the referrer and the newly approved shop get a free Boost credit.
router.put('/shop-applications/:id/approve', requireAuth, requireAdmin, async (req, res) => {
  try {
    const userResult = await pool.query(
      'SELECT referred_by FROM pool6.users WHERE id = $1',
      [req.params.id]
    );

    await pool.query(`UPDATE pool6.users SET shop_status = 'approved', shop_rejection_reason = NULL WHERE id = $1`, [req.params.id]);

    sendPushNotification(
      req.params.id,
      '✅ Shop Approved!',
      'Your shop account has been verified. You can now post listings. Please submit your NRC and selfie within the safety period when prompted.'
    );

    const referredBy = userResult.rows[0]?.referred_by;
    if (referredBy) {
      await pool.query(
        'UPDATE pool6.users SET free_boost_credits = free_boost_credits + 1 WHERE id = $1',
        [referredBy]
      );
      await pool.query(
        'UPDATE pool6.users SET free_boost_credits = free_boost_credits + 1 WHERE id = $1',
        [req.params.id]
      );

      sendPushNotification(
        referredBy,
        '🎁 Referral Reward!',
        'Someone you referred just got their shop approved — you both earned a free Boost credit!'
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not approve shop application.' });
  }
});

// GET - admin: pending NRC verification submissions (step 1 already approved)
router.get('/nrc-verifications/pending', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, phone, shop_name, nrc_number, nrc_photo_url, nrc_back_photo_url, selfie_photo_url,
              city, province, location_label, date_joined
       FROM pool6.users
       WHERE account_type = 'shop'
         AND shop_status = 'approved'
         AND nrc_status = 'pending'
         AND nrc_photo_url IS NOT NULL
       ORDER BY date_joined ASC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load NRC verifications.' });
  }
});

// PUT - admin: approve NRC verification
router.put('/nrc-verifications/:id/approve', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE pool6.users
       SET nrc_verified = TRUE, nrc_status = 'approved'
       WHERE id = $1 AND account_type = 'shop' AND shop_status = 'approved'
       RETURNING id`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'NRC submission not found.' });
    }

    sendPushNotification(
      req.params.id,
      '✅ NRC Verified',
      'Your identity documents have been approved. Your listings will stay visible on ZedMarket.'
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not approve NRC verification.' });
  }
});

// PUT - admin: reject NRC verification
router.put('/nrc-verifications/:id/reject', requireAuth, requireAdmin, async (req, res) => {
  const { reason } = req.body;

  try {
    const result = await pool.query(
      `UPDATE pool6.users
       SET nrc_verified = FALSE, nrc_status = 'rejected'
       WHERE id = $1 AND account_type = 'shop' AND shop_status = 'approved'
       RETURNING id`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'NRC submission not found.' });
    }

    sendPushNotification(
      req.params.id,
      'NRC Verification Declined',
      reason
        ? `Your NRC verification was not approved: ${reason}. Please resubmit clear photos.`
        : 'Your NRC verification could not be approved. Please resubmit your documents.'
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not reject NRC verification.' });
  }
});

// POST - start the 5-day NRC submission window for all shops (admin only)
router.post('/announce-nrc-period', requireAuth, requireAdmin, async (req, res) => {
  try {
    const existing = await pool.query('SELECT nrc_grace_period_end FROM pool6.app_settings WHERE id = 1');
    if (existing.rows[0]?.nrc_grace_period_end) {
      return res.status(400).json({ error: 'NRC grace period has already been announced.' });
    }

    const nrcGracePeriodEnd = new Date(Date.now() + NRC_GRACE_DAYS * 24 * 60 * 60 * 1000);

    await pool.query(
      'UPDATE pool6.app_settings SET nrc_grace_period_end = $1 WHERE id = 1',
      [nrcGracePeriodEnd]
    );

    const shopsResult = await pool.query(
      `SELECT id FROM pool6.users
       WHERE account_type = 'shop' AND shop_status = 'approved'`
    );

    for (const shop of shopsResult.rows) {
      sendPushNotification(
        shop.id,
        '📋 NRC Verification Required',
        `All shops must submit NRC and a selfie within ${NRC_GRACE_DAYS} days. Open My Shop to submit yours.`
      );
    }

    res.json({
      success: true,
      nrc_grace_period_end: nrcGracePeriodEnd,
      notified: shopsResult.rows.length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not announce NRC period.' });
  }
});

// PUT - admin: reset NRC grace period (for testing)
router.put('/undo-nrc-period', requireAuth, requireAdmin, async (req, res) => {
  try {
    await pool.query('UPDATE pool6.app_settings SET nrc_grace_period_end = NULL WHERE id = 1');
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not reset NRC period.' });
  }
});

// PUT - admin: reject a shop application, with a reason the seller will see
router.put('/shop-applications/:id/reject', requireAuth, requireAdmin, async (req, res) => {
  const { reason } = req.body;

  try {
    await pool.query(
      `UPDATE pool6.users SET shop_status = 'rejected', shop_rejection_reason = $1 WHERE id = $2`,
      [reason || 'No reason provided.', req.params.id]
    );
    sendPushNotification(
      req.params.id,
      'Shop Application Declined',
      reason ? `Your shop verification was not approved: ${reason}` : 'Your shop verification could not be approved. Please contact support for more information.'
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not reject shop application.' });
  }
});

// GET - admin: pending shop NAME CHANGE requests (different from initial shop applications)
router.get('/shop-name-requests/pending', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, phone, shop_name, pending_shop_name
       FROM pool6.users
       WHERE shop_name_status = 'pending' AND pending_shop_name IS NOT NULL
       ORDER BY id ASC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load shop name requests.' });
  }
});

// PUT - admin: approve a shop name change
router.put('/shop-name-requests/:id/approve', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE pool6.users
       SET shop_name = pending_shop_name, pending_shop_name = NULL, shop_name_status = NULL
       WHERE id = $1 RETURNING shop_name`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found.' });
    }

    sendPushNotification(
      req.params.id,
      '✅ Shop Name Approved',
      `Your shop is now shown as "${result.rows[0].shop_name}".`
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not approve shop name change.' });
  }
});

// PUT - admin: reject a shop name change
router.put('/shop-name-requests/:id/reject', requireAuth, requireAdmin, async (req, res) => {
  try {
    await pool.query(
      `UPDATE pool6.users SET pending_shop_name = NULL, shop_name_status = 'rejected' WHERE id = $1`,
      [req.params.id]
    );

    sendPushNotification(
      req.params.id,
      'Shop Name Change Declined',
      'Your requested shop name change was not approved. Please contact support for more information.'
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not reject shop name change.' });
  }
});

// GET - admin: current subscription plan prices
router.get('/plan-prices', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT category, price FROM pool6.plan_prices ORDER BY category');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load plan prices.' });
  }
});

// PUT - admin: update a subscription plan price
router.put('/plan-prices/:category', requireAuth, requireAdmin, async (req, res) => {
  const { price } = req.body;

  if (!price || isNaN(parseFloat(price)) || parseFloat(price) <= 0) {
    return res.status(400).json({ error: 'A valid price is required.' });
  }

  try {
    const result = await pool.query(
      `UPDATE pool6.plan_prices SET price = $1 WHERE category = $2 RETURNING *`,
      [parseFloat(price), req.params.category]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found.' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not update price.' });
  }
});

// POST - announce payment requirement to all users (admin only)
router.post('/announce-payment', requireAuth, requireAdmin, async (req, res) => {
  const { message } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'A warning message is required.' });
  }

  try {
    const gracePeriodEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await pool.query(
      `UPDATE pool6.app_settings
       SET grace_period_end = $1, warning_message = $2, announced_at = NOW()
       WHERE id = 1`,
      [gracePeriodEnd, message]
    );

    const usersResult = await pool.query(
      `SELECT id FROM pool6.users WHERE push_token IS NOT NULL`
    );

    for (const user of usersResult.rows) {
      sendPushNotification(user.id, '⚠️ Important: Subscription Required Soon', message);
    }

    res.json({ success: true, grace_period_end: gracePeriodEnd, notified: usersResult.rows.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not send announcement.' });
  }
});

// PUT - extend the grace period by a number of days (admin only)
router.put('/extend-grace-period', requireAuth, requireAdmin, async (req, res) => {
  const { days } = req.body;
  const extendDays = parseInt(days) || 3;

  try {
    const current = await pool.query('SELECT grace_period_end FROM pool6.app_settings WHERE id = 1');
    const currentEnd = current.rows[0]?.grace_period_end;

    if (!currentEnd) {
      return res.status(400).json({ error: 'No active announcement to extend.' });
    }

    const newEnd = new Date(new Date(currentEnd).getTime() + extendDays * 24 * 60 * 60 * 1000);

    await pool.query('UPDATE pool6.app_settings SET grace_period_end = $1 WHERE id = 1', [newEnd]);

    res.json({ success: true, grace_period_end: newEnd });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not extend grace period.' });
  }
});

// PUT - undo/reset the announcement entirely (admin only, for testing)
router.put('/undo-announcement', requireAuth, requireAdmin, async (req, res) => {
  try {
    await pool.query(
      `UPDATE pool6.app_settings SET grace_period_end = NULL, warning_message = NULL, announced_at = NULL WHERE id = 1`
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not undo announcement.' });
  }
});

// POST - send a general broadcast message to all users (admin only)
// Also saves it as a chat message from the admin so it's visible inside the app afterward
router.post('/broadcast', requireAuth, requireAdmin, async (req, res) => {
  const { title, message } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'A message is required.' });
  }

  try {
    const allUsersResult = await pool.query(
      `SELECT id, push_token FROM pool6.users WHERE id != $1`,
      [req.userId]
    );

    for (const user of allUsersResult.rows) {
      await pool.query(
        `INSERT INTO pool6.messages (sender_id, receiver_id, content)
         VALUES ($1, $2, $3)`,
        [req.userId, user.id, message]
      );

      if (user.push_token) {
        sendPushNotification(
          user.id,
          title?.trim() || '📢 ZedMarket',
          message,
          { type: 'chat', otherUserId: req.userId }
        );
      }
    }

    res.json({ success: true, notified: allUsersResult.rows.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not send broadcast.' });
  }
});

module.exports = router;

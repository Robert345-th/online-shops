const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const africastalking = require('africastalking');
const router = express.Router();
const pool = require('./db');
const requireAuth = require('./middleware');
const JWT_SECRET = process.env.JWT_SECRET;
const AT = africastalking({
  apiKey: process.env.AT_API_KEY,
  username: process.env.AT_USERNAME,
});
const smsService = AT.SMS;
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
function toIntlPhone(phone) {
  return phone.startsWith('0') ? '+260' + phone.slice(1) : phone;
}
function generateReferralCodeCandidate() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
async function generateUniqueReferralCode() {
  let code;
  let exists = true;
  while (exists) {
    code = generateReferralCodeCandidate();
    const check = await pool.query('SELECT 1 FROM pool6.users WHERE referral_code = $1', [code]);
    exists = check.rows.length > 0;
  }
  return code;
}
async function checkOtpLimit(userId) {
  const result = await pool.query(
    'SELECT otp_send_count, otp_window_start FROM pool6.users WHERE id = $1',
    [userId]
  );
  const user = result.rows[0];
  const now = new Date();
  const windowStart = user.otp_window_start ? new Date(user.otp_window_start) : null;
  const windowExpired = !windowStart || (now.getTime() - windowStart.getTime()) > 24 * 60 * 60 * 1000;
  if (windowExpired) {
    await pool.query(
      'UPDATE pool6.users SET otp_send_count = 1, otp_window_start = NOW() WHERE id = $1',
      [userId]
    );
    return { allowed: true };
  }
  if (user.otp_send_count >= 2) {
    const hoursLeft = Math.ceil((24 * 60 * 60 * 1000 - (now.getTime() - windowStart.getTime())) / (60 * 60 * 1000));
    return { allowed: false, hoursLeft };
  }
  await pool.query(
    'UPDATE pool6.users SET otp_send_count = otp_send_count + 1 WHERE id = $1',
    [userId]
  );
  return { allowed: true };
}
// SIGNUP - creates a buyer account, sends OTP, not verified yet (name, phone, password only)
// Optionally accepts a referral_code from a friend who invited them
router.post('/signup', async (req, res) => {
  const { name, phone, password, confirmPassword, referral_code } = req.body;
  if (!name || !phone || !password || !confirmPassword) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ error: 'Passwords do not match.' });
  }
  try {
    let referrerId = null;
    if (referral_code && referral_code.trim()) {
      const referrerCheck = await pool.query(
        'SELECT id FROM pool6.users WHERE referral_code = $1',
        [referral_code.trim().toUpperCase()]
      );
      if (referrerCheck.rows.length === 0) {
        return res.status(400).json({ error: 'That referral code was not found.' });
      }
      referrerId = referrerCheck.rows[0].id;
    }
    const existing = await pool.query(
      'SELECT id, phone_verified FROM pool6.users WHERE phone = $1',
      [phone]
    );
    const password_hash = await bcrypt.hash(password, 10);
    const otp = generateOTP();
    const expires = new Date(Date.now() + 10 * 60 * 1000);
    let user;
    if (existing.rows.length > 0) {
      if (existing.rows[0].phone_verified) {
        return res.status(400).json({ error: 'This phone number is already registered.' });
      }
      const limitCheck = await checkOtpLimit(existing.rows[0].id);
      if (!limitCheck.allowed) {
        return res.status(429).json({
          error: `You've reached the code limit. Please try again in ${limitCheck.hoursLeft} hour(s).`,
        });
      }
      const updateResult = await pool.query(
        `UPDATE pool6.users
         SET name = $1, password_hash = $2, otp_code = $3, otp_expires = $4, referred_by = $5
         WHERE phone = $6
         RETURNING id, name, phone`,
        [name, password_hash, otp, expires, referrerId, phone]
      );
      user = updateResult.rows[0];
    } else {
      const newReferralCode = await generateUniqueReferralCode();
      const insertResult = await pool.query(
        `INSERT INTO pool6.users (name, phone, password_hash, otp_code, otp_expires, otp_send_count, otp_window_start, referral_code, referred_by)
         VALUES ($1, $2, $3, $4, $5, 1, NOW(), $6, $7) RETURNING id, name, phone`,
        [name, phone, password_hash, otp, expires, newReferralCode, referrerId]
      );
      user = insertResult.rows[0];
    }
    try {
      await smsService.send({
        to: [toIntlPhone(phone)],
        message: `Your ZedMarket verification code is: ${otp}`,
      });
    } catch (smsErr) {
      console.error('SMS send failed:', smsErr);
    }
    res.status(201).json({ user, message: 'Account created. Please verify with the OTP sent to your phone.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong creating the account.' });
  }
});
// VERIFY OTP
router.post('/verify-otp', async (req, res) => {
  const { phone, otp } = req.body;
  if (!phone || !otp) {
    return res.status(400).json({ error: 'Phone and OTP are required.' });
  }
  try {
    const result = await pool.query(
      'SELECT * FROM pool6.users WHERE phone = $1',
      [phone]
    );
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Account not found.' });
    }
    const user = result.rows[0];
    if (user.phone_verified) {
      return res.status(400).json({ error: 'Phone already verified.' });
    }
    if (user.otp_code !== otp) {
      return res.status(400).json({ error: 'Incorrect OTP.' });
    }
    if (new Date() > new Date(user.otp_expires)) {
      return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
    }
    await pool.query(
      `UPDATE pool6.users SET phone_verified = true, otp_code = NULL, otp_expires = NULL WHERE id = $1`,
      [user.id]
    );
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });
    res.json({
      user: { id: user.id, name: user.name, phone: user.phone, is_admin: user.is_admin, account_type: user.account_type, shop_status: user.shop_status },
      token,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not verify OTP.' });
  }
});
// RESEND OTP
router.post('/resend-otp', async (req, res) => {
  const { phone } = req.body;
  try {
    const result = await pool.query('SELECT * FROM pool6.users WHERE phone = $1', [phone]);
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Account not found.' });
    }
    const user = result.rows[0];
    const limitCheck = await checkOtpLimit(user.id);
    if (!limitCheck.allowed) {
      return res.status(429).json({
        error: `You've reached the code limit. Please try again in ${limitCheck.hoursLeft} hour(s).`,
      });
    }
    const otp = generateOTP();
    const expires = new Date(Date.now() + 10 * 60 * 1000);
    await pool.query(
      'UPDATE pool6.users SET otp_code = $1, otp_expires = $2 WHERE phone = $3',
      [otp, expires, phone]
    );
    await smsService.send({
      to: [toIntlPhone(phone)],
      message: `Your ZedMarket verification code is: ${otp}`,
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not resend OTP.' });
  }
});
// FORGOT PASSWORD - send an OTP to reset password
router.post('/forgot-password', async (req, res) => {
  const { phone } = req.body;
  if (!phone) {
    return res.status(400).json({ error: 'Phone number is required.' });
  }
  try {
    const result = await pool.query('SELECT id FROM pool6.users WHERE phone = $1', [phone]);
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'No account found with that phone number.' });
    }
    const userId = result.rows[0].id;
    const limitCheck = await checkOtpLimit(userId);
    if (!limitCheck.allowed) {
      return res.status(429).json({
        error: `You've reached the code limit. Please try again in ${limitCheck.hoursLeft} hour(s).`,
      });
    }
    const otp = generateOTP();
    const expires = new Date(Date.now() + 10 * 60 * 1000);
    await pool.query(
      'UPDATE pool6.users SET otp_code = $1, otp_expires = $2 WHERE phone = $3',
      [otp, expires, phone]
    );
    await smsService.send({
      to: [toIntlPhone(phone)],
      message: `Your ZedMarket password reset code is: ${otp}`,
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not send reset code.' });
  }
});
// RESET PASSWORD - verify OTP and set a new password
router.post('/reset-password', async (req, res) => {
  const { phone, otp, newPassword, confirmNewPassword } = req.body;
  if (!phone || !otp || !newPassword || !confirmNewPassword) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  if (newPassword !== confirmNewPassword) {
    return res.status(400).json({ error: 'Passwords do not match.' });
  }
  try {
    const result = await pool.query('SELECT * FROM pool6.users WHERE phone = $1', [phone]);
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Account not found.' });
    }
    const user = result.rows[0];
    if (user.otp_code !== otp) {
      return res.status(400).json({ error: 'Incorrect code.' });
    }
    if (new Date() > new Date(user.otp_expires)) {
      return res.status(400).json({ error: 'Code has expired. Please request a new one.' });
    }
    const password_hash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      'UPDATE pool6.users SET password_hash = $1, otp_code = NULL, otp_expires = NULL WHERE id = $2',
      [password_hash, user.id]
    );
    res.json({ success: true, message: 'Password reset successfully. Please log in.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not reset password.' });
  }
});
// LOGIN
router.post('/login', async (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) {
    return res.status(400).json({ error: 'Phone and password are required.' });
  }
  try {
    const result = await pool.query(
      'SELECT * FROM pool6.users WHERE phone = $1',
      [phone]
    );
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Phone number or password is incorrect.' });
    }
    const user = result.rows[0];
    if (user.is_deleted) {
      return res.status(400).json({ error: 'Phone number or password is incorrect.' });
    }
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(400).json({ error: 'Phone number or password is incorrect.' });
    }
    if (user.is_suspended) {
      return res.status(403).json({ error: 'Your account has been suspended. Contact support.' });
    }
    if (!user.phone_verified) {
      return res.status(403).json({ error: 'Please verify your phone number first.', needsVerification: true });
    }
    // Backfill: older accounts created before referral codes existed won't have one yet
    if (!user.referral_code) {
      const newCode = await generateUniqueReferralCode();
      await pool.query('UPDATE pool6.users SET referral_code = $1 WHERE id = $2', [newCode, user.id]);
      user.referral_code = newCode;
    }
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });
    res.json({
      user: { id: user.id, name: user.name, phone: user.phone, is_admin: user.is_admin, account_type: user.account_type, shop_status: user.shop_status },
      token
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong logging in.' });
  }
});
// GET MY REFERRAL INFO - my code, how many people I've referred, and my free boost credits
router.get('/referral-info', requireAuth, async (req, res) => {
  try {
    const userResult = await pool.query(
      'SELECT referral_code, free_boost_credits FROM pool6.users WHERE id = $1',
      [req.userId]
    );
    let referralCode = userResult.rows[0]?.referral_code;
    if (!referralCode) {
      referralCode = await generateUniqueReferralCode();
      await pool.query('UPDATE pool6.users SET referral_code = $1 WHERE id = $2', [referralCode, req.userId]);
    }
    const referralsResult = await pool.query(
      'SELECT COUNT(*) FROM pool6.users WHERE referred_by = $1',
      [req.userId]
    );
    const approvedReferralsResult = await pool.query(
      `SELECT COUNT(*) FROM pool6.users WHERE referred_by = $1 AND shop_status = 'approved'`,
      [req.userId]
    );
    res.json({
      referral_code: referralCode,
      total_referrals: parseInt(referralsResult.rows[0].count),
      approved_referrals: parseInt(approvedReferralsResult.rows[0].count),
      free_boost_credits: userResult.rows[0]?.free_boost_credits || 0,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load referral info.' });
  }
});
// GET - basic public info about a user, for showing in a chat header
// (name, shop name/photo if they're a shop, and phone for the "view contact" option)
router.get('/user-info/:id', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, phone, shop_name, shop_photo_url, account_type, is_admin
       FROM pool6.users WHERE id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }
    const user = result.rows[0];
    res.json({
      id: user.id,
      display_name: user.is_admin ? 'ZedMarket Support' : (user.shop_name || user.name),
      shop_photo_url: user.shop_photo_url || null,
      phone: user.phone,
      is_shop: user.account_type === 'shop',
      is_admin: user.is_admin,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load user info.' });
  }
});
// REGISTER SHOP - a buyer submits a shop name to become a seller, pending admin approval.
// NRC/selfie verification is currently OPTIONAL while it's disabled — once you announce
// the requirement later (via admin), these fields become mandatory again.
// Works for both first-time applicants and people resubmitting after a rejection.
router.post('/register-shop', requireAuth, async (req, res) => {
  const { shop_name, nrc_number, nrc_photo_url, nrc_back_photo_url, selfie_photo_url } = req.body;

  try {
    const settingsResult = await pool.query('SELECT nrc_grace_period_end FROM pool6.app_settings WHERE id = 1');
    const nrcGracePeriodEnd = settingsResult.rows[0]?.nrc_grace_period_end;
    const nrcRequired = nrcGracePeriodEnd && new Date() > new Date(nrcGracePeriodEnd);

    if (nrcRequired && (!nrc_number || !nrc_photo_url || !nrc_back_photo_url || !selfie_photo_url)) {
      return res.status(400).json({ error: 'NRC number, both sides of your NRC, and a selfie are all required.' });
    }

    await pool.query(
      `UPDATE pool6.users
       SET account_type = 'shop', shop_name = $1, nrc_number = $2, nrc_photo_url = $3, nrc_back_photo_url = $4, selfie_photo_url = $5, shop_status = 'pending', shop_rejection_reason = NULL
       WHERE id = $6`,
      [
        shop_name && shop_name.trim() ? shop_name.trim() : null,
        nrc_number || null,
        nrc_photo_url || null,
        nrc_back_photo_url || null,
        selfie_photo_url || null,
        req.userId,
      ]
    );
    res.json({ success: true, message: 'Shop registration submitted. You will be notified once approved.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not submit shop registration.' });
  }
});
// GET MY SHOP REGISTRATION STATUS
router.get('/shop-status', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT account_type, shop_status, shop_name, shop_rejection_reason FROM pool6.users WHERE id = $1',
      [req.userId]
    );
    res.json({
      account_type: result.rows[0]?.account_type || 'individual',
      shop_status: result.rows[0]?.shop_status || null,
      shop_name: result.rows[0]?.shop_name || null,
      shop_rejection_reason: result.rows[0]?.shop_rejection_reason || null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load shop status.' });
  }
});
// GET MY FULL SHOP PROFILE (for the edit screen)
router.get('/shop-profile', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT shop_name, shop_photo_url, shop_bio, pending_shop_name, shop_name_status
       FROM pool6.users WHERE id = $1`,
      [req.userId]
    );
    res.json(result.rows[0] || {});
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load shop profile.' });
  }
});
// PUT - update shop profile. Photo and bio apply immediately. A new shop name goes to pending review.
router.put('/shop-profile', requireAuth, async (req, res) => {
  const { shop_photo_url, shop_bio, new_shop_name } = req.body;
  try {
    if (shop_photo_url !== undefined) {
      await pool.query('UPDATE pool6.users SET shop_photo_url = $1 WHERE id = $2', [shop_photo_url, req.userId]);
    }
    if (shop_bio !== undefined) {
      await pool.query('UPDATE pool6.users SET shop_bio = $1 WHERE id = $2', [shop_bio, req.userId]);
    }
    if (new_shop_name && new_shop_name.trim()) {
      await pool.query(
        `UPDATE pool6.users SET pending_shop_name = $1, shop_name_status = 'pending' WHERE id = $2`,
        [new_shop_name.trim(), req.userId]
      );
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not update shop profile.' });
  }
});
// GET MY DIGEST NOTIFICATION SETTING
router.get('/digest-settings', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT digest_enabled FROM pool6.users WHERE id = $1', [req.userId]);
    res.json({ digest_enabled: result.rows[0]?.digest_enabled !== false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load digest settings.' });
  }
});
// PUT - toggle digest notifications on/off
router.put('/digest-settings', requireAuth, async (req, res) => {
  const { enabled } = req.body;
  try {
    await pool.query('UPDATE pool6.users SET digest_enabled = $1 WHERE id = $2', [enabled, req.userId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not update digest settings.' });
  }
});
// DELETE MY ACCOUNT - soft delete: anonymizes personal info but keeps reports/messages/reviews for safety investigations
router.delete('/me', requireAuth, async (req, res) => {
  try {
    const anonymizedPhone = `deleted_${req.userId}_${Date.now()}`;
    await pool.query(
      `UPDATE pool6.users
       SET name = 'Deleted User',
           phone = $1,
           password_hash = 'DELETED',
           push_token = NULL,
           is_deleted = true,
           deleted_at = NOW()
       WHERE id = $2`,
      [anonymizedPhone, req.userId]
    );
    await pool.query(
      `UPDATE pool6.listings SET status = 'removed' WHERE seller_id = $1`,
      [req.userId]
    );
    res.json({ success: true, message: 'Your account has been deleted.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not delete account.' });
  }
});
module.exports = router;

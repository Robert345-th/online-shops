const express = require('express');
const router = express.Router();
const pool = require('./db');
const requireAuth = require('./middleware');
const fetch = require('node-fetch');

// SAVE push token
router.post('/save-token', requireAuth, async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'Token is required.' });
  }

  try {
    await pool.query(
      'UPDATE pool6.users SET push_token = $1 WHERE id = $2',
      [token, req.userId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not save push token.' });
  }
});

// Helper function to send a push notification to a specific user
// `data` is an optional object attached to the notification, used by the app to know where to navigate when tapped
async function sendWebPushNotification(userId, title, body, url, tag) {
  const secret = process.env.PUSH_WEBHOOK_SECRET;
  if (!secret) return;

  const pushUrl = process.env.PWA_PUSH_URL || 'https://zedmarket.app/api/push/notify';
  try {
    await fetch(pushUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-push-secret': secret,
      },
      body: JSON.stringify({
        user_id: String(userId),
        title,
        body,
        url: url || '/',
        tag: tag || `zedmarket-${userId}`,
      }),
    });
  } catch (err) {
    console.error('Web push webhook failed:', err);
  }
}

async function sendPushNotification(userId, title, body, data = {}) {
  try {
    const result = await pool.query(
      'SELECT push_token FROM pool6.users WHERE id = $1',
      [userId]
    );

    const token = result.rows[0]?.push_token;
    if (token) {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: token,
          sound: 'default',
          title,
          body,
          data,
        }),
      });
    }
  } catch (err) {
    console.error('Push notification failed:', err);
  }

  const url = data.url || (data.type === 'wanted' ? '/wanted.html' : '/chat-list.html');
  const tag = data.tag || (data.type === 'wanted' ? `wanted-${data.wantedId || userId}` : `zedmarket-${userId}`);
  await sendWebPushNotification(userId, title, body, url, tag);
}

module.exports = { router, sendPushNotification };

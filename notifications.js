const express = require('express');
const router = express.Router();
const pool = require('./db');
const requireAuth = require('./middleware');
const fetch = require('node-fetch');

let firebaseAdmin = null;
let firebaseInitTried = false;

function getFirebaseMessaging() {
  if (firebaseInitTried) {
    return firebaseAdmin ? firebaseAdmin.messaging() : null;
  }
  firebaseInitTried = true;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    const admin = require('firebase-admin');
    const cred = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(cred) });
    }
    firebaseAdmin = admin;
    return admin.messaging();
  } catch (err) {
    console.error('Firebase admin init failed:', err.message || err);
    firebaseAdmin = null;
    return null;
  }
}

function isExpoPushToken(token) {
  return typeof token === 'string' && /ExponentPushToken|ExpoPushToken/.test(token);
}

function isFcmToken(token) {
  return typeof token === 'string' && token.length > 40 && !isExpoPushToken(token);
}

function pushUrlFromData(data) {
  if (data.url) return data.url;
  if (data.type === 'wanted') return '/wanted.html';
  if (data.type === 'chat' && data.otherUserId) {
    const name = data.senderName ? `&name=${encodeURIComponent(data.senderName)}` : '';
    return `/chat-room.html?userId=${data.otherUserId}${name}`;
  }
  if (data.type === 'listing' && data.listingId) {
    return `/listing.html?id=${data.listingId}`;
  }
  return '/chat-list.html';
}

// SAVE push token (Expo or FCM)
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

router.get('/status', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT push_token FROM pool6.users WHERE id = $1',
      [req.userId]
    );
    const token = result.rows[0]?.push_token;
    res.json({ hasFcm: isFcmToken(token) });
  } catch (err) {
    res.status(500).json({ error: 'Could not check push status.' });
  }
});

router.post('/test-self', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT push_token FROM pool6.users WHERE id = $1',
      [req.userId]
    );
    const token = result.rows[0]?.push_token;
    if (!isFcmToken(token)) {
      return res.json({ sent: 0, hasFcm: false, reason: 'no_fcm_token' });
    }
    const sent = await sendFcmNotification(
      req.userId,
      token,
      'ZedMarket',
      'This is a test ping.',
      '/chat-list.html',
      'test-self',
      { type: 'test' }
    );
    res.json({ sent: sent ? 1 : 0, hasFcm: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not send test ping.' });
  }
});

async function sendWebPushNotification(userId, title, body, url, tag, type) {
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
        type: type || undefined,
      }),
    });
  } catch (err) {
    console.error('Web push webhook failed:', err);
  }
}

async function sendFcmNotification(userId, token, title, body, url, tag, extra = {}) {
  const messaging = getFirebaseMessaging();
  if (!messaging) {
    console.error('FCM skipped: Firebase is not configured');
    return false;
  }
  const type = extra.type != null ? String(extra.type) : '';
  const otherUserId = extra.otherUserId != null ? String(extra.otherUserId) : '';
  const isChat = type === 'chat' && otherUserId;
  const payload = {
    token,
    data: {
      title: String(title || 'ZedMarket'),
      body: String(body || ''),
      url: String(url || '/chat-list.html'),
      tag: String(tag || `zedmarket-${userId}`),
      type,
      otherUserId,
    },
    android: {
      priority: 'high',
    },
  };
  // Chat pings are data-only so Android can show a Reply box. Other alerts
  // keep a display payload so the system tray still works if the app is dead.
  if (!isChat) {
    payload.notification = { title, body };
    payload.android.notification = {
      channelId: 'zedmarket_messages',
      clickAction: 'OPEN_ZEDMARKET',
    };
  }
  try {
    await messaging.send(payload);
    console.log('FCM sent', userId, type || 'alert');
    return true;
  } catch (err) {
    const code = err.errorInfo?.code || err.code;
    console.error('FCM send failed:', code, err.message || err);
    if (
      code === 'messaging/registration-token-not-registered'
      || code === 'messaging/invalid-registration-token'
    ) {
      try {
        await pool.query(
          'UPDATE pool6.users SET push_token = NULL WHERE id = $1 AND push_token = $2',
          [userId, token]
        );
      } catch (e) {}
    }
    return false;
  }
}

async function sendExpoNotification(token, title, body, data) {
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: token,
        sound: 'default',
        title,
        body,
        data,
      }),
    });
  } catch (err) {
    console.error('Expo push failed:', err);
  }
}

async function sendPushNotification(userId, title, body, data = {}) {
  const url = pushUrlFromData(data);
  const tag = data.tag || (data.type === 'wanted' ? `wanted-${data.wantedId || userId}` : `zedmarket-${userId}`);

  try {
    const result = await pool.query(
      'SELECT push_token FROM pool6.users WHERE id = $1',
      [userId]
    );
    const token = result.rows[0]?.push_token;
    if (isFcmToken(token)) {
      await sendFcmNotification(userId, token, title, body, url, tag, data);
    } else if (isExpoPushToken(token)) {
      await sendExpoNotification(token, title, body, { ...data, url });
    } else {
      console.log('Push skipped: no FCM token for user', userId);
    }
  } catch (err) {
    console.error('Push notification failed:', err);
  }

  await sendWebPushNotification(userId, title, body, url, tag, data.type);
}

module.exports = { router, sendPushNotification };

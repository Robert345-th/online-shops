const express = require('express');
const router = express.Router();
const pool = require('./db');
const requireAuth = require('./middleware');
const { sendPushNotification } = require('./notifications');

const AUTO_REPLY_KEYWORDS = [
  {
    keywords: ['shop', 'register', 'sell', 'seller'],
    tip: "To start selling, go to My Shop → Register My Shop, and submit your NRC (front & back) plus a selfie. It's usually reviewed within a day or two.",
  },
  {
    keywords: ['payment', 'momo', 'pay', 'subscription', 'upgrade'],
    tip: 'For payments, send the amount shown via MTN MoMo or Airtel Money to 0778727201, then submit your transaction reference in the app for review.',
  },
  {
    keywords: ['boost'],
    tip: "Boosting puts your listing at the top of the feed for 24 hours. Go to My Shop → pick a listing → Boost Listing to request one.",
  },
  {
    keywords: ['delete', 'account', 'close'],
    tip: 'You can delete your account anytime from Settings → Delete My Account. This is permanent.',
  },
  {
    keywords: ['scam', 'fraud', 'report', 'block'],
    tip: 'If someone is acting suspiciously, you can report them from Settings → Report a User, or block them directly in your chat with them.',
  },
  {
    keywords: ['reject', 'rejected', 'denied'],
    tip: "If your shop application was rejected, check My Shop for the reason given, fix the issue, and tap 'Try Again' to resubmit.",
  },
];

function getAutoReplyTip(messageContent) {
  if (!messageContent) return null;
  const lower = messageContent.toLowerCase();
  for (const entry of AUTO_REPLY_KEYWORDS) {
    if (entry.keywords.some((kw) => lower.includes(kw))) {
      return entry.tip;
    }
  }
  return null;
}

async function maybeSendAutoReply(adminId, senderId) {
  try {
    // Don't auto-reply more than once every 24 hours to the same person,
    // so it doesn't spam them if they send several messages in a row.
    const recentReplyCheck = await pool.query(
      `SELECT 1 FROM pool6.messages
       WHERE sender_id = $1 AND receiver_id = $2
       AND sent_at > NOW() - INTERVAL '24 hours'`,
      [adminId, senderId]
    );

    if (recentReplyCheck.rows.length > 0) return;

    const lastMessageResult = await pool.query(
      `SELECT content FROM pool6.messages
       WHERE sender_id = $1 AND receiver_id = $2
       ORDER BY sent_at DESC LIMIT 1`,
      [senderId, adminId]
    );

    const tip = getAutoReplyTip(lastMessageResult.rows[0]?.content);

    let autoReplyText = "Thanks for reaching out! I'll get back to you personally as soon as I can.";
    if (tip) {
      autoReplyText += `\n\nIn the meantime: ${tip}`;
    }

    await pool.query(
      `INSERT INTO pool6.messages (sender_id, receiver_id, content)
       VALUES ($1, $2, $3)`,
      [adminId, senderId, autoReplyText]
    );

    sendPushNotification(
      senderId,
      'Support',
      autoReplyText.length > 60 ? autoReplyText.slice(0, 60) + '...' : autoReplyText,
      { type: 'chat', otherUserId: adminId }
    );
  } catch (err) {
    console.error('Auto-reply failed:', err);
  }
}

// GET - list of conversations (grouped by other person)
router.get('/conversations', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT ON (other_user_id)
         other_user_id,
         u.name AS other_user_name,
         m.content AS last_message,
         m.photo_url AS last_photo_url,
         m.audio_url AS last_audio_url,
         m.sent_at AS last_sent_at,
         m.sender_id,
         (SELECT COUNT(*) FROM pool6.messages
          WHERE receiver_id = $1 AND sender_id = other_user_id AND read_at IS NULL) AS unread_count
       FROM (
         SELECT
           CASE WHEN sender_id = $1 THEN receiver_id ELSE sender_id END AS other_user_id,
           content, photo_url, audio_url, sent_at, sender_id
         FROM pool6.messages
         WHERE sender_id = $1 OR receiver_id = $1
         ORDER BY sent_at DESC
       ) m
       JOIN pool6.users u ON u.id = m.other_user_id
       ORDER BY other_user_id, m.sent_at DESC`,
      [req.userId]
    );

    result.rows.sort((a, b) => new Date(b.last_sent_at).getTime() - new Date(a.last_sent_at).getTime());

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load conversations.' });
  }
});

// GET - messages between me and another user
router.get('/conversation/:otherUserId', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, sender_id, receiver_id, content, photo_url, audio_url, audio_duration, sent_at, read_at
       FROM pool6.messages
       WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1)
       ORDER BY sent_at ASC`,
      [req.userId, req.params.otherUserId]
    );

    await pool.query(
      `UPDATE pool6.messages SET read_at = NOW()
       WHERE sender_id = $1 AND receiver_id = $2 AND read_at IS NULL`,
      [req.params.otherUserId, req.userId]
    );

    const blockCheck = await pool.query(
      `SELECT
        EXISTS(SELECT 1 FROM pool6.blocked_users WHERE blocker_id = $1 AND blocked_id = $2) AS i_blocked_them,
        EXISTS(SELECT 1 FROM pool6.blocked_users WHERE blocker_id = $2 AND blocked_id = $1) AS they_blocked_me`,
      [req.userId, req.params.otherUserId]
    );

    res.json({
      messages: result.rows,
      i_blocked_them: blockCheck.rows[0].i_blocked_them,
      they_blocked_me: blockCheck.rows[0].they_blocked_me,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load messages.' });
  }
});

// POST - send a message (text, and/or a photo, and/or a voice note)
router.post('/', requireAuth, async (req, res) => {
  const { receiver_id, content, photo_url, audio_url, audio_duration, listing_id } = req.body;

  if (!receiver_id) {
    return res.status(400).json({ error: 'Receiver is required.' });
  }

  if (!content && !photo_url && !audio_url) {
    return res.status(400).json({ error: 'A message, photo, or voice note is required.' });
  }

  try {
    const blockCheck = await pool.query(
      `SELECT 1 FROM pool6.blocked_users WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)`,
      [req.userId, receiver_id]
    );

    if (blockCheck.rows.length > 0) {
      return res.status(403).json({ error: 'You cannot message this user.' });
    }

    const result = await pool.query(
      `INSERT INTO pool6.messages (sender_id, receiver_id, listing_id, content, photo_url, audio_url, audio_duration)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [req.userId, receiver_id, listing_id || null, content || null, photo_url || null, audio_url || null, audio_duration || null]
    );

    const senderResult = await pool.query('SELECT name FROM pool6.users WHERE id = $1', [req.userId]);
    const senderName = senderResult.rows[0]?.name || 'Someone';

    let previewText = content;
    if (photo_url) previewText = '📷 Sent a photo';
    if (audio_url) previewText = '🎤 Sent a voice note';

    sendPushNotification(
      receiver_id,
      `New message from ${senderName}`,
      previewText && previewText.length > 60 ? previewText.slice(0, 60) + '...' : previewText,
      { type: 'chat', otherUserId: req.userId }
    );

    // If this message was sent TO the support/admin account (and not FROM the admin themselves),
    // send a quick automatic acknowledgment so people aren't left waiting with silence.
    const adminCheck = await pool.query('SELECT id FROM pool6.users WHERE is_admin = true ORDER BY id ASC LIMIT 1');
    const adminId = adminCheck.rows[0]?.id;
    if (adminId && parseInt(receiver_id) === adminId && req.userId !== adminId) {
      maybeSendAutoReply(adminId, req.userId);
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not send message.' });
  }
});

// GET - total unread count (for badge)
router.get('/unread-count', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT COUNT(*) AS count FROM pool6.messages WHERE receiver_id = $1 AND read_at IS NULL`,
      [req.userId]
    );
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load unread count.' });
  }
});

// POST - block a user
router.post('/block/:userId', requireAuth, async (req, res) => {
  try {
    await pool.query(
      `INSERT INTO pool6.blocked_users (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [req.userId, req.params.userId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not block user.' });
  }
});

// DELETE - unblock a user
router.delete('/block/:userId', requireAuth, async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM pool6.blocked_users WHERE blocker_id = $1 AND blocked_id = $2`,
      [req.userId, req.params.userId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not unblock user.' });
  }
});

module.exports = router;

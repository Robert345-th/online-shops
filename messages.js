const express = require('express');
const router = express.Router();
const pool = require('./db');
const requireAuth = require('./middleware');
const { sendPushNotification } = require('./notifications');

// GET - list of conversations (grouped by other person)
router.get('/conversations', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT ON (other_user_id)
         other_user_id,
         u.name AS other_user_name,
         m.content AS last_message,
         m.photo_url AS last_photo_url,
         m.sent_at AS last_sent_at,
         m.sender_id,
         (SELECT COUNT(*) FROM pool6.messages
          WHERE receiver_id = $1 AND sender_id = other_user_id AND read_at IS NULL) AS unread_count
       FROM (
         SELECT
           CASE WHEN sender_id = $1 THEN receiver_id ELSE sender_id END AS other_user_id,
           content, photo_url, sent_at, sender_id
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
      `SELECT id, sender_id, receiver_id, content, photo_url, sent_at, read_at
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

// POST - send a message (text and/or a photo)
router.post('/', requireAuth, async (req, res) => {
  const { receiver_id, content, photo_url, listing_id } = req.body;

  if (!receiver_id) {
    return res.status(400).json({ error: 'Receiver is required.' });
  }

  if (!content && !photo_url) {
    return res.status(400).json({ error: 'A message or photo is required.' });
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
      `INSERT INTO pool6.messages (sender_id, receiver_id, listing_id, content, photo_url)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [req.userId, receiver_id, listing_id || null, content || null, photo_url || null]
    );

    const senderResult = await pool.query('SELECT name FROM pool6.users WHERE id = $1', [req.userId]);
    const senderName = senderResult.rows[0]?.name || 'Someone';

    sendPushNotification(
      receiver_id,
      `New message from ${senderName}`,
      photo_url ? '📷 Sent a photo' : (content.length > 60 ? content.slice(0, 60) + '...' : content),
      { type: 'chat', otherUserId: req.userId }
    );

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

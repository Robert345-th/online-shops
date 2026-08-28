const express = require('express');
const router = express.Router();
const pool = require('./db');
const requireAuth = require('./middleware');
const { sendPushNotification } = require('./notifications');

// GET - list of conversations (grouped by other person)
router.get('/conversations', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `WITH latest AS (
         SELECT DISTINCT ON (
           CASE WHEN sender_id = $1 THEN receiver_id ELSE sender_id END
         )
           CASE WHEN sender_id = $1 THEN receiver_id ELSE sender_id END AS other_user_id,
           content, photo_url, audio_url, deleted_for_everyone, sent_at, sender_id
         FROM pool6.messages
         WHERE (sender_id = $1 AND deleted_for_sender = false)
            OR (receiver_id = $1 AND deleted_for_receiver = false)
         ORDER BY CASE WHEN sender_id = $1 THEN receiver_id ELSE sender_id END, sent_at DESC
       ),
       unread AS (
         SELECT sender_id AS other_user_id, COUNT(*)::int AS unread_count
         FROM pool6.messages
         WHERE receiver_id = $1 AND read_at IS NULL
           AND deleted_for_receiver = false AND deleted_for_everyone = false
         GROUP BY sender_id
       )
       SELECT
         l.other_user_id,
         u.name AS other_user_name,
         l.content AS last_message,
         l.photo_url AS last_photo_url,
         l.audio_url AS last_audio_url,
         l.deleted_for_everyone AS last_deleted_for_everyone,
         l.sent_at AS last_sent_at,
         l.sender_id,
         COALESCE(un.unread_count, 0) AS unread_count
       FROM latest l
       JOIN pool6.users u ON u.id = l.other_user_id
       LEFT JOIN unread un ON un.other_user_id = l.other_user_id
       ORDER BY l.sent_at DESC`,
      [req.userId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load conversations.' });
  }
});

// GET - messages between me and another user (excludes anything deleted for me)
router.get('/conversation/:otherUserId', requireAuth, async (req, res) => {
  const otherId = req.params.otherUserId;
  const afterId = parseInt(req.query.after_id, 10);
  const incremental = Number.isFinite(afterId) && afterId > 0;

  try {
    const messagesQuery = incremental
      ? pool.query(
          `SELECT id, sender_id, receiver_id, listing_id, content, photo_url, audio_url, audio_duration,
                  deleted_for_everyone, sent_at, read_at
           FROM pool6.messages
           WHERE ((sender_id = $1 AND receiver_id = $2 AND deleted_for_sender = false)
              OR (sender_id = $2 AND receiver_id = $1 AND deleted_for_receiver = false))
             AND id > $3
           ORDER BY sent_at ASC`,
          [req.userId, otherId, afterId]
        )
      : pool.query(
          `SELECT id, sender_id, receiver_id, listing_id, content, photo_url, audio_url, audio_duration,
                  deleted_for_everyone, sent_at, read_at
           FROM pool6.messages
           WHERE ((sender_id = $1 AND receiver_id = $2 AND deleted_for_sender = false)
              OR (sender_id = $2 AND receiver_id = $1 AND deleted_for_receiver = false))
           ORDER BY sent_at ASC`,
          [req.userId, otherId]
        );

    const readQuery = pool.query(
      `SELECT COALESCE(MAX(id), 0) AS latest_read_id
       FROM pool6.messages
       WHERE sender_id = $1 AND receiver_id = $2 AND read_at IS NOT NULL`,
      [req.userId, otherId]
    );

    const blockQuery = pool.query(
      `SELECT
        EXISTS(SELECT 1 FROM pool6.blocked_users WHERE blocker_id = $1 AND blocked_id = $2) AS i_blocked_them,
        EXISTS(SELECT 1 FROM pool6.blocked_users WHERE blocker_id = $2 AND blocked_id = $1) AS they_blocked_me`,
      [req.userId, otherId]
    );

    const listingQuery = incremental
      ? Promise.resolve({ rows: [] })
      : pool.query(
          `SELECT l.id, l.title, l.price, l.photos, l.status
           FROM pool6.messages m
           JOIN pool6.listings l ON l.id = m.listing_id
           WHERE ((m.sender_id = $1 AND m.receiver_id = $2) OR (m.sender_id = $2 AND m.receiver_id = $1))
             AND m.listing_id IS NOT NULL
             AND m.deleted_for_everyone = false
           ORDER BY m.sent_at DESC
           LIMIT 1`,
          [req.userId, otherId]
        );

    const [result, readResult, blockCheck, listingContextResult] = await Promise.all([
      messagesQuery,
      readQuery,
      blockQuery,
      listingQuery,
    ]);

    res.json({
      messages: result.rows,
      incremental,
      latest_read_id: parseInt(readResult.rows[0].latest_read_id, 10) || 0,
      listing_context: listingContextResult.rows[0] || null,
      i_blocked_them: blockCheck.rows[0].i_blocked_them,
      they_blocked_me: blockCheck.rows[0].they_blocked_me,
    });

    pool.query(
      `UPDATE pool6.messages SET read_at = NOW()
       WHERE sender_id = $1 AND receiver_id = $2 AND read_at IS NULL`,
      [otherId, req.userId]
    ).catch(() => {});
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
    const result = await pool.query(
      `INSERT INTO pool6.messages (sender_id, receiver_id, listing_id, content, photo_url, audio_url, audio_duration)
       SELECT $1, $2, $3, $4, $5, $6, $7
       WHERE NOT EXISTS (
         SELECT 1 FROM pool6.blocked_users
         WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)
       )
       RETURNING *`,
      [req.userId, receiver_id, listing_id || null, content || null, photo_url || null, audio_url || null, audio_duration || null]
    );

    if (!result.rows.length) {
      return res.status(403).json({ error: 'You cannot message this user.' });
    }

    const saved = result.rows[0];
    res.status(201).json(saved);

    (async () => {
      try {
        const senderResult = await pool.query('SELECT name FROM pool6.users WHERE id = $1', [req.userId]);
        const senderName = senderResult.rows[0]?.name || 'Someone';
        let previewText = content;
        if (photo_url) previewText = '📷 Sent a photo';
        if (audio_url) previewText = '🎤 Sent a voice note';
        await sendPushNotification(
          receiver_id,
          `New message from ${senderName}`,
          previewText && previewText.length > 60 ? previewText.slice(0, 60) + '...' : previewText,
          { type: 'chat', otherUserId: req.userId }
        );
      } catch (e) {}
    })();
    return;
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not send message.' });
  }
});

// PUT - delete a message just for me (the other person still sees it normally)
router.put('/:id/delete-for-me', requireAuth, async (req, res) => {
  try {
    const check = await pool.query(
      'SELECT sender_id, receiver_id FROM pool6.messages WHERE id = $1',
      [req.params.id]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found.' });
    }

    const msg = check.rows[0];

    if (msg.sender_id === req.userId) {
      await pool.query('UPDATE pool6.messages SET deleted_for_sender = true WHERE id = $1', [req.params.id]);
    } else if (msg.receiver_id === req.userId) {
      await pool.query('UPDATE pool6.messages SET deleted_for_receiver = true WHERE id = $1', [req.params.id]);
    } else {
      return res.status(403).json({ error: 'You are not part of this conversation.' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not delete message.' });
  }
});

// PUT - unsend a message for everyone. Only allowed if you sent it AND the
// other person hasn't read it yet.
router.put('/:id/delete-for-everyone', requireAuth, async (req, res) => {
  try {
    const check = await pool.query(
      'SELECT sender_id, read_at FROM pool6.messages WHERE id = $1',
      [req.params.id]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found.' });
    }

    const msg = check.rows[0];

    if (msg.sender_id !== req.userId) {
      return res.status(403).json({ error: 'You can only unsend your own messages.' });
    }

    if (msg.read_at) {
      return res.status(400).json({ error: 'This message has already been read and can no longer be unsent for everyone.' });
    }

    await pool.query(
      `UPDATE pool6.messages
       SET deleted_for_everyone = true, content = NULL, photo_url = NULL, audio_url = NULL
       WHERE id = $1`,
      [req.params.id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not unsend message.' });
  }
});

// GET - total unread count (for badge)
router.get('/unread-count', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT COUNT(*) AS count FROM pool6.messages
       WHERE receiver_id = $1 AND read_at IS NULL AND deleted_for_receiver = false AND deleted_for_everyone = false`,
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

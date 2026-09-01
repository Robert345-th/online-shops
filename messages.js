const express = require('express');
const router = express.Router();
const pool = require('./db');
const requireAuth = require('./middleware');
const { sendPushNotification } = require('./notifications');
const { presencePublicFields } = require('./user-presence');
const { ensureBlockedUsersTable, getBlockState } = require('./user-blocks');

let offerColumnsReady = null;
async function ensureOfferColumns() {
  if (!offerColumnsReady) {
    offerColumnsReady = (async () => {
      await pool.query(`ALTER TABLE pool6.messages ADD COLUMN IF NOT EXISTS offer_amount NUMERIC`);
      await pool.query(`ALTER TABLE pool6.messages ADD COLUMN IF NOT EXISTS offer_status TEXT`);
    })().catch((err) => {
      offerColumnsReady = null;
      throw err;
    });
  }
  await offerColumnsReady;
}

// GET - list of conversations (grouped by other person)
router.get('/conversations', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `WITH latest AS (
         SELECT DISTINCT ON (
           CASE WHEN sender_id = $1 THEN receiver_id ELSE sender_id END
         )
           CASE WHEN sender_id = $1 THEN receiver_id ELSE sender_id END AS other_user_id,
           content, photo_url, audio_url, deleted_for_everyone, sent_at, sender_id, read_at
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
         u.is_admin AS other_user_is_admin,
         l.content AS last_message,
         l.photo_url AS last_photo_url,
         l.audio_url AS last_audio_url,
         l.deleted_for_everyone AS last_deleted_for_everyone,
         l.sent_at AS last_sent_at,
         l.sender_id,
         l.read_at AS last_read_at,
         u.last_seen_at,
         u.show_online,
         u.show_last_seen,
         COALESCE(un.unread_count, 0) AS unread_count
       FROM latest l
       JOIN pool6.users u ON u.id = l.other_user_id
       LEFT JOIN unread un ON un.other_user_id = l.other_user_id
       WHERE NOT EXISTS (
         SELECT 1 FROM pool6.blocked_users b
         WHERE (b.blocker_id = $1 AND b.blocked_id = l.other_user_id)
            OR (b.blocker_id = l.other_user_id AND b.blocked_id = $1)
       )
       ORDER BY l.sent_at DESC`,
      [req.userId]
    );

    const prefs = await loadChatPrefs(req.userId);
    const rows = result.rows.map((row) => {
      const pref = prefs[String(row.other_user_id)] || {};
      const presence = presencePublicFields({
        last_seen_at: row.last_seen_at,
        show_online: row.show_online,
        show_last_seen: row.show_last_seen,
        is_admin: row.other_user_is_admin,
      });
      const iSentLast = Number(row.sender_id) === Number(req.userId);
      return {
        other_user_id: row.other_user_id,
        other_user_name: row.other_user_name,
        other_user_is_admin: row.other_user_is_admin,
        last_message: row.last_message,
        last_photo_url: row.last_photo_url,
        last_audio_url: row.last_audio_url,
        last_deleted_for_everyone: row.last_deleted_for_everyone,
        last_sent_at: row.last_sent_at,
        sender_id: row.sender_id,
        last_read_at: row.last_read_at,
        last_message_read: iSentLast && !!row.last_read_at,
        unread_count: row.unread_count,
        pinned: !!pref.pinned,
        muted: !!pref.muted,
        presence,
      };
    });
    rows.sort((a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.last_sent_at) - new Date(a.last_sent_at));
    res.json(rows);
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
    await ensureOfferColumns();
    const messagesQuery = incremental
      ? pool.query(
          `SELECT id, sender_id, receiver_id, listing_id, content, photo_url, audio_url, audio_duration,
                  offer_amount, offer_status,
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
                  offer_amount, offer_status,
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

    const presenceQuery = pool.query(
      `SELECT last_seen_at, show_online, show_last_seen, is_admin
       FROM pool6.users WHERE id = $1`,
      [otherId]
    );

    const [result, readResult, blockCheck, listingContextResult, presenceResult] = await Promise.all([
      messagesQuery,
      readQuery,
      blockQuery,
      listingQuery,
      presenceQuery,
    ]);

    res.json({
      messages: result.rows,
      incremental,
      latest_read_id: parseInt(readResult.rows[0].latest_read_id, 10) || 0,
      listing_context: listingContextResult.rows[0] || null,
      i_blocked_them: blockCheck.rows[0].i_blocked_them,
      they_blocked_me: blockCheck.rows[0].they_blocked_me,
      presence: presencePublicFields(presenceResult.rows[0]),
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

// POST - send a message (text, and/or a photo, and/or a voice note, and/or an offer)
router.post('/', requireAuth, async (req, res) => {
  const { receiver_id, content, photo_url, audio_url, audio_duration, listing_id, offer_amount } = req.body;

  if (!receiver_id) {
    return res.status(400).json({ error: 'Receiver is required.' });
  }

  let offerAmount = null;
  let offerStatus = null;
  let messageContent = content || null;
  if (offer_amount != null && offer_amount !== '') {
    offerAmount = parseFloat(offer_amount);
    if (!Number.isFinite(offerAmount) || offerAmount <= 0) {
      return res.status(400).json({ error: 'Enter a valid offer amount.' });
    }
    offerAmount = Math.round(offerAmount * 100) / 100;
    offerStatus = 'pending';
    if (!messageContent) messageContent = `Offer: K${offerAmount}`;
  }

  if (!messageContent && !photo_url && !audio_url) {
    return res.status(400).json({ error: 'A message, photo, or voice note is required.' });
  }

  try {
    await ensureOfferColumns();
    if (offerAmount != null) {
      if (!listing_id) {
        return res.status(400).json({ error: 'Offer must be on a listing.' });
      }
      const listingRow = await pool.query(
        'SELECT seller_id FROM pool6.listings WHERE id = $1',
        [listing_id]
      );
      if (!listingRow.rows.length) {
        return res.status(404).json({ error: 'Listing not found.' });
      }
      const sellerId = listingRow.rows[0].seller_id;
      if (Number(sellerId) === Number(req.userId)) {
        return res.status(400).json({ error: 'You cannot offer on your own listing.' });
      }
      if (parseInt(receiver_id, 10) !== sellerId) {
        return res.status(400).json({ error: 'Offers go to the seller.' });
      }
    }
    const result = await pool.query(
      `INSERT INTO pool6.messages (sender_id, receiver_id, listing_id, content, photo_url, audio_url, audio_duration, offer_amount, offer_status)
       SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9
       WHERE NOT EXISTS (
         SELECT 1 FROM pool6.blocked_users
         WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)
       )
       RETURNING *`,
      [req.userId, receiver_id, listing_id || null, messageContent, photo_url || null, audio_url || null, audio_duration || null, offerAmount, offerStatus]
    );

    if (!result.rows.length) {
      return res.status(403).json({ error: 'You cannot message this user.' });
    }

    const saved = result.rows[0];
    res.status(201).json(saved);

    (async () => {
      try {
        recordReplyTime(req.userId, receiver_id);
        if (await isChatMuted(receiver_id, req.userId)) return;
        const senderResult = await pool.query('SELECT name FROM pool6.users WHERE id = $1', [req.userId]);
        const senderName = senderResult.rows[0]?.name || 'Someone';
        let previewText = messageContent;
        if (offerAmount) previewText = `Offer: K${offerAmount}`;
        if (photo_url) previewText = '📷 Sent a photo';
        if (audio_url) previewText = '🎤 Sent a voice note';
        await sendPushNotification(
          receiver_id,
          `New message from ${senderName}`,
          previewText && previewText.length > 60 ? previewText.slice(0, 60) + '...' : previewText,
          { type: 'chat', otherUserId: req.userId, senderName }
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

    if (Number(msg.sender_id) === Number(req.userId)) {
      await pool.query('UPDATE pool6.messages SET deleted_for_sender = true WHERE id = $1', [req.params.id]);
    } else if (Number(msg.receiver_id) === Number(req.userId)) {
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

    if (Number(msg.sender_id) !== Number(req.userId)) {
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

router.put('/prefs/:otherUserId', requireAuth, async (req, res) => {
  const otherId = parseInt(req.params.otherUserId, 10);
  if (!Number.isFinite(otherId) || otherId <= 0 || otherId === req.userId) {
    return res.status(400).json({ error: 'Invalid user.' });
  }
  try {
    await ensureMarketplaceTables();
    const pinned = typeof req.body.pinned === 'boolean' ? req.body.pinned : null;
    const muted = typeof req.body.muted === 'boolean' ? req.body.muted : null;
    const result = await pool.query(
      `INSERT INTO pool6.chat_prefs (user_id, other_user_id, pinned, muted)
       VALUES ($1, $2, COALESCE($3, false), COALESCE($4, false))
       ON CONFLICT (user_id, other_user_id) DO UPDATE SET
         pinned = COALESCE($3, pool6.chat_prefs.pinned),
         muted = COALESCE($4, pool6.chat_prefs.muted)
       RETURNING pinned, muted`,
      [req.userId, otherId, pinned, muted]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not update chat settings.' });
  }
});

// GET - block status with another user
router.get('/block/:userId', requireAuth, async (req, res) => {
  try {
    const otherId = parseInt(req.params.userId, 10);
    if (!Number.isFinite(otherId) || otherId <= 0) {
      return res.status(400).json({ error: 'Invalid user.' });
    }
    const state = await getBlockState(req.userId, otherId);
    res.json(state);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load block status.' });
  }
});

// POST - block a user
router.post('/block/:userId', requireAuth, async (req, res) => {
  try {
    const otherId = parseInt(req.params.userId, 10);
    if (!Number.isFinite(otherId) || otherId <= 0) {
      return res.status(400).json({ error: 'Invalid user.' });
    }
    if (Number(otherId) === Number(req.userId)) {
      return res.status(400).json({ error: 'You cannot block yourself.' });
    }
    await ensureBlockedUsersTable();
    const other = await pool.query('SELECT id, is_admin FROM pool6.users WHERE id = $1', [otherId]);
    if (!other.rows.length) {
      return res.status(404).json({ error: 'User not found.' });
    }
    if (other.rows[0].is_admin) {
      return res.status(400).json({ error: 'You cannot block this account.' });
    }
    await pool.query(
      `INSERT INTO pool6.blocked_users (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [req.userId, otherId]
    );
    res.json({ success: true, i_blocked_them: true });
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

router.post('/offer/:id/respond', requireAuth, async (req, res) => {
  const action = String(req.body.action || '').toLowerCase();
  if (!['accept', 'decline', 'counter'].includes(action)) {
    return res.status(400).json({ error: 'Choose accept, decline, or counter.' });
  }
  try {
    await ensureOfferColumns();
    const msgResult = await pool.query(
      `SELECT * FROM pool6.messages WHERE id = $1`,
      [req.params.id]
    );
    const msg = msgResult.rows[0];
    if (!msg || !msg.offer_amount || msg.offer_status !== 'pending') {
      return res.status(404).json({ error: 'Offer not found.' });
    }
    if (Number(msg.receiver_id) !== Number(req.userId)) {
      return res.status(403).json({ error: 'Only the other person can respond to this offer.' });
    }
    if (action === 'counter') {
      const counterAmount = parseFloat(req.body.amount);
      if (!Number.isFinite(counterAmount) || counterAmount <= 0) {
        return res.status(400).json({ error: 'Enter a counter amount.' });
      }
      await pool.query(
        `UPDATE pool6.messages SET offer_status = 'countered' WHERE id = $1`,
        [msg.id]
      );
      const rounded = Math.round(counterAmount * 100) / 100;
      const inserted = await pool.query(
        `INSERT INTO pool6.messages (sender_id, receiver_id, listing_id, content, offer_amount, offer_status)
         VALUES ($1, $2, $3, $4, $5, 'pending')
         RETURNING *`,
        [req.userId, msg.sender_id, msg.listing_id, `Counter offer: K${rounded}`, rounded]
      );
      sendPushNotification(
        msg.sender_id,
        'Counter offer',
        `Counter offer: K${rounded}`,
        { type: 'chat', otherUserId: req.userId }
      );
      return res.json({ updated: { ...msg, offer_status: 'countered' }, message: inserted.rows[0] });
    }
    const status = action === 'accept' ? 'accepted' : 'declined';
    const updated = await pool.query(
      `UPDATE pool6.messages SET offer_status = $1 WHERE id = $2 RETURNING *`,
      [status, msg.id]
    );
    if (action === 'accept' && msg.listing_id) {
      await pool.query(
        `UPDATE pool6.listings SET status = 'reserved'
         WHERE id = $1 AND status = 'active' AND seller_id IN ($2, $3)`,
        [msg.listing_id, req.userId, msg.sender_id]
      );
    }
    sendPushNotification(
      msg.sender_id,
      action === 'accept' ? 'Offer accepted' : 'Offer declined',
      action === 'accept' ? `Your offer of K${msg.offer_amount} was accepted` : `Your offer of K${msg.offer_amount} was declined`,
      { type: 'chat', otherUserId: req.userId }
    );
    res.json({ message: updated.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not respond to offer.' });
  }
});

module.exports = router;
module.exports.ensureOfferColumns = ensureOfferColumns;

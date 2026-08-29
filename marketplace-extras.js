const pool = require('./db');
const { sendPushNotification } = require('./notifications');

let extrasReady = null;

async function ensureMarketplaceTables() {
  if (!extrasReady) {
    extrasReady = (async () => {
      await pool.query(`ALTER TABLE pool6.users ADD COLUMN IF NOT EXISTS avg_reply_secs INTEGER`);
      await pool.query(`ALTER TABLE pool6.users ADD COLUMN IF NOT EXISTS reply_count INTEGER DEFAULT 0`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS pool6.saved_searches (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES pool6.users(id) ON DELETE CASCADE,
          query TEXT NOT NULL DEFAULT '',
          category TEXT,
          city TEXT,
          max_price NUMERIC,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS saved_searches_user_id_idx ON pool6.saved_searches (user_id)`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS pool6.listing_watches (
          user_id INTEGER NOT NULL REFERENCES pool6.users(id) ON DELETE CASCADE,
          listing_id INTEGER NOT NULL REFERENCES pool6.listings(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (user_id, listing_id)
        )
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS listing_watches_listing_id_idx ON pool6.listing_watches (listing_id)`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS pool6.chat_prefs (
          user_id INTEGER NOT NULL REFERENCES pool6.users(id) ON DELETE CASCADE,
          other_user_id INTEGER NOT NULL REFERENCES pool6.users(id) ON DELETE CASCADE,
          pinned BOOLEAN NOT NULL DEFAULT false,
          muted BOOLEAN NOT NULL DEFAULT false,
          PRIMARY KEY (user_id, other_user_id)
        )
      `);
    })().catch((err) => {
      extrasReady = null;
      throw err;
    });
  }
  await extrasReady;
}

async function notifySavedSearches(sellerId, listing, categoryName) {
  try {
    await ensureMarketplaceTables();
    const title = String(listing.title || '');
    const description = String(listing.description || '');
    const price = parseFloat(listing.price);
    const location = String(listing.location_label || '');
    const result = await pool.query(
      `SELECT DISTINCT s.user_id
       FROM pool6.saved_searches s
       WHERE s.user_id <> $1
         AND (s.category IS NULL OR s.category = '' OR s.category = 'All' OR LOWER(s.category) = LOWER($2))
         AND (s.max_price IS NULL OR s.max_price >= $3)
         AND (
           COALESCE(s.query, '') = ''
           OR $4 ILIKE '%' || s.query || '%'
           OR $5 ILIKE '%' || s.query || '%'
         )
         AND (
           COALESCE(s.city, '') = ''
           OR $6 ILIKE '%' || s.city || '%'
         )
       LIMIT 40`,
      [sellerId, categoryName || '', Number.isFinite(price) ? price : 0, title, description, location]
    );
    const preview = title.slice(0, 70) || 'a new listing';
    for (const row of result.rows) {
      sendPushNotification(
        row.user_id,
        'New match for your search',
        `${preview} — K${listing.price}`,
        {
          type: 'listing',
          listingId: listing.id,
          url: `/listing.html?id=${listing.id}`,
          tag: `search-${listing.id}-${row.user_id}`,
        }
      );
    }
  } catch (err) {
    console.error('notifySavedSearches failed:', err);
  }
}

async function recordReplyTime(senderId, receiverId) {
  try {
    await ensureMarketplaceTables();
    const inbound = await pool.query(
      `SELECT sent_at FROM pool6.messages
       WHERE sender_id = $1 AND receiver_id = $2
       ORDER BY id DESC LIMIT 1`,
      [receiverId, senderId]
    );
    if (!inbound.rows.length) return;
    const previousMine = await pool.query(
      `SELECT sent_at FROM pool6.messages
       WHERE sender_id = $1 AND receiver_id = $2
       ORDER BY id DESC LIMIT 1 OFFSET 1`,
      [senderId, receiverId]
    );
    const theirAt = new Date(inbound.rows[0].sent_at).getTime();
    if (previousMine.rows[0] && new Date(previousMine.rows[0].sent_at).getTime() >= theirAt) return;
    const secs = Math.round((Date.now() - theirAt) / 1000);
    if (secs < 8 || secs > 7 * 24 * 3600) return;
    await pool.query(
      `UPDATE pool6.users SET
         reply_count = COALESCE(reply_count, 0) + 1,
         avg_reply_secs = CASE
           WHEN COALESCE(reply_count, 0) = 0 OR avg_reply_secs IS NULL THEN $2
           ELSE ROUND(avg_reply_secs * 0.7 + $2 * 0.3)
         END
       WHERE id = $1`,
      [senderId, secs]
    );
  } catch (err) {
    console.error('recordReplyTime failed:', err);
  }
}

async function isChatMuted(receiverId, senderId) {
  try {
    await ensureMarketplaceTables();
    const result = await pool.query(
      `SELECT muted FROM pool6.chat_prefs WHERE user_id = $1 AND other_user_id = $2`,
      [receiverId, senderId]
    );
    return result.rows[0]?.muted === true;
  } catch (e) {
    return false;
  }
}

async function loadChatPrefs(userId) {
  try {
    await ensureMarketplaceTables();
    const result = await pool.query(
      `SELECT other_user_id, pinned, muted FROM pool6.chat_prefs WHERE user_id = $1`,
      [userId]
    );
    const map = {};
    result.rows.forEach((row) => {
      map[String(row.other_user_id)] = { pinned: !!row.pinned, muted: !!row.muted };
    });
    return map;
  } catch (e) {
    return {};
  }
}

async function notifyListingWatchers(listingId, title, body, data) {
  try {
    await ensureMarketplaceTables();
    const result = await pool.query(
      `SELECT user_id FROM pool6.listing_watches WHERE listing_id = $1 LIMIT 80`,
      [listingId]
    );
    for (const row of result.rows) {
      sendPushNotification(row.user_id, title, body, data);
    }
  } catch (err) {
    console.error('notifyListingWatchers failed:', err);
  }
}

module.exports = {
  ensureMarketplaceTables,
  notifySavedSearches,
  notifyListingWatchers,
  recordReplyTime,
  isChatMuted,
  loadChatPrefs,
};

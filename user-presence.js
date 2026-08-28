const pool = require('./db');

const ONLINE_MS = 90 * 1000;
let lastSeenReady = null;

async function ensureLastSeenColumns() {
  if (!lastSeenReady) {
    lastSeenReady = pool.query(
      `ALTER TABLE pool6.users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ`
    ).then(() => pool.query(
      `ALTER TABLE pool6.users ADD COLUMN IF NOT EXISTS show_online BOOLEAN DEFAULT true`
    )).then(() => pool.query(
      `ALTER TABLE pool6.users ADD COLUMN IF NOT EXISTS show_last_seen BOOLEAN DEFAULT true`
    )).catch((err) => {
      lastSeenReady = null;
      throw err;
    });
  }
  await lastSeenReady;
}

function presencePublicFields(user) {
  if (!user || user.is_admin) {
    return { online: false, last_seen: null, hidden: true };
  }
  const lastAt = user.last_seen_at || null;
  const showOnline = user.show_online !== false;
  const showLastSeen = user.show_last_seen !== false;
  const recentlyActive = !!(lastAt && Date.now() - new Date(lastAt).getTime() < ONLINE_MS);
  return {
    online: showOnline && recentlyActive,
    last_seen: showLastSeen ? lastAt : null,
    hide_online: !showOnline,
    hidden: !showOnline && !showLastSeen,
  };
}

module.exports = { ONLINE_MS, ensureLastSeenColumns, presencePublicFields };

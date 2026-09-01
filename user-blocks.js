const pool = require('./db');

let blockedTableReady = null;

async function ensureBlockedUsersTable() {
  if (!blockedTableReady) {
    blockedTableReady = pool.query(`
      CREATE TABLE IF NOT EXISTS pool6.blocked_users (
        blocker_id INTEGER NOT NULL REFERENCES pool6.users(id) ON DELETE CASCADE,
        blocked_id INTEGER NOT NULL REFERENCES pool6.users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (blocker_id, blocked_id),
        CHECK (blocker_id <> blocked_id)
      )
    `).catch((err) => {
      blockedTableReady = null;
      throw err;
    });
  }
  await blockedTableReady;
}

function blockPairSql(viewerParam, sellerExpr) {
  return `NOT EXISTS (
    SELECT 1 FROM pool6.blocked_users b
    WHERE (b.blocker_id = ${viewerParam} AND b.blocked_id = ${sellerExpr})
       OR (b.blocker_id = ${sellerExpr} AND b.blocked_id = ${viewerParam})
  )`;
}

async function getBlockState(viewerId, otherId) {
  const a = parseInt(viewerId, 10);
  const b = parseInt(otherId, 10);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) {
    return { i_blocked_them: false, they_blocked_me: false };
  }
  await ensureBlockedUsersTable();
  const result = await pool.query(
    `SELECT
       EXISTS(SELECT 1 FROM pool6.blocked_users WHERE blocker_id = $1 AND blocked_id = $2) AS i_blocked_them,
       EXISTS(SELECT 1 FROM pool6.blocked_users WHERE blocker_id = $2 AND blocked_id = $1) AS they_blocked_me`,
    [a, b]
  );
  const row = result.rows[0] || {};
  return {
    i_blocked_them: row.i_blocked_them === true,
    they_blocked_me: row.they_blocked_me === true,
  };
}

async function isBlockedPair(viewerId, otherId) {
  const state = await getBlockState(viewerId, otherId);
  return state.i_blocked_them || state.they_blocked_me;
}

module.exports = {
  ensureBlockedUsersTable,
  blockPairSql,
  getBlockState,
  isBlockedPair,
};

const jwt = require('jsonwebtoken');
const pool = require('./db');

const accountStatusCache = new Map();
const ACCOUNT_STATUS_TTL_MS = 15000;
const ACCOUNT_STATUS_CACHE_MAX = 2000;

function readAccountCache(userId) {
  const hit = accountStatusCache.get(userId);
  if (!hit) return null;
  if (Date.now() - hit.ts > ACCOUNT_STATUS_TTL_MS) {
    accountStatusCache.delete(userId);
    return null;
  }
  return hit.row;
}

function writeAccountCache(userId, row) {
  if (accountStatusCache.size > ACCOUNT_STATUS_CACHE_MAX) accountStatusCache.clear();
  accountStatusCache.set(userId, { ts: Date.now(), row });
}

async function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // "Bearer <token>"

  if (!token) {
    return res.status(401).json({ error: 'Not logged in.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;
    let account = readAccountCache(userId);

    if (!account) {
      const result = await pool.query(
        'SELECT is_suspended, is_deleted FROM pool6.users WHERE id = $1',
        [userId]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Account not found. Please log in again.' });
      }

      account = result.rows[0];
      writeAccountCache(userId, account);
    }

    if (account.is_deleted) {
      return res.status(403).json({ error: 'This account no longer exists.' });
    }

    if (account.is_suspended) {
      res.set('X-Account-Suspended', '1');
      return res.status(403).json({ error: 'Your account has been suspended. Contact support.', suspended: true });
    }

    req.userId = userId;
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid or expired login. Please log in again.' });
    }
    console.error(err);
    return res.status(500).json({ error: 'Could not verify your session.' });
  }
}

module.exports = requireAuth;

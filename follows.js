const express = require('express');
const router = express.Router();
const pool = require('./db');
const requireAuth = require('./middleware');
const { sendPushNotification } = require('./notifications');

let tableReady = null;

async function ensureShopFollowsTable() {
  if (!tableReady) {
    tableReady = pool.query(`
      CREATE TABLE IF NOT EXISTS pool6.shop_follows (
        follower_id INTEGER NOT NULL REFERENCES pool6.users(id) ON DELETE CASCADE,
        shop_id INTEGER NOT NULL REFERENCES pool6.users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (follower_id, shop_id),
        CONSTRAINT shop_follows_no_self CHECK (follower_id <> shop_id)
      )
    `).then(() => pool.query(
      `CREATE INDEX IF NOT EXISTS shop_follows_shop_id_idx ON pool6.shop_follows (shop_id)`
    )).catch((err) => {
      tableReady = null;
      throw err;
    });
  }
  await tableReady;
}

async function getFollowCounts(userId) {
  await ensureShopFollowsTable();
  const result = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM pool6.shop_follows WHERE shop_id = $1) AS followers,
       (SELECT COUNT(*)::int FROM pool6.shop_follows WHERE follower_id = $1) AS following`,
    [userId]
  );
  return {
    followers: result.rows[0]?.followers || 0,
    following: result.rows[0]?.following || 0,
  };
}

function parseUserId(value) {
  const id = parseInt(value, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

async function notifyShopFollowers(shopId, listing) {
  try {
    await ensureShopFollowsTable();
    const shopResult = await pool.query(
      `SELECT COALESCE(NULLIF(shop_name, ''), name) AS display_name
       FROM pool6.users WHERE id = $1`,
      [shopId]
    );
    const shopName = shopResult.rows[0]?.display_name || 'A shop';
    const followers = await pool.query(
      `SELECT follower_id FROM pool6.shop_follows WHERE shop_id = $1 LIMIT 200`,
      [shopId]
    );
    const title = String(listing.title || 'a new item').slice(0, 80);
    for (const row of followers.rows) {
      sendPushNotification(
        row.follower_id,
        'New listing',
        `${shopName} posted "${title}"`,
        {
          type: 'listing',
          listingId: listing.id,
          url: `/listing.html?id=${listing.id}`,
          tag: `follow-${listing.id}`,
        }
      );
    }
  } catch (err) {
    console.error('notifyShopFollowers failed:', err);
  }
}

router.get('/', requireAuth, async (req, res) => {
  try {
    await ensureShopFollowsTable();
    const result = await pool.query(
      `SELECT
         u.id,
         COALESCE(NULLIF(u.shop_name, ''), u.name) AS display_name,
         u.shop_name,
         u.name,
         (
           SELECT COUNT(*)::int
           FROM pool6.listings l
           WHERE l.seller_id = u.id
             AND l.status = 'active'
             AND l.date_posted > NOW() - INTERVAL '7 days'
         ) AS new_listings
       FROM pool6.shop_follows f
       JOIN pool6.users u ON u.id = f.shop_id
       WHERE f.follower_id = $1
         AND (u.is_deleted = false OR u.is_deleted IS NULL)
         AND (u.is_suspended = false OR u.is_suspended IS NULL)
       ORDER BY f.created_at DESC`,
      [req.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load shops you follow.' });
  }
});

router.get('/counts/:userId', async (req, res) => {
  const userId = parseUserId(req.params.userId);
  if (!userId) return res.status(400).json({ error: 'Invalid shop.' });
  try {
    const counts = await getFollowCounts(userId);
    res.json(counts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load follow counts.' });
  }
});

router.get('/followers/:shopId', async (req, res) => {
  const shopId = parseUserId(req.params.shopId);
  if (!shopId) return res.status(400).json({ error: 'Invalid shop.' });
  try {
    await ensureShopFollowsTable();
    const result = await pool.query(
      `SELECT
         u.id,
         COALESCE(NULLIF(u.shop_name, ''), u.name) AS display_name,
         u.shop_name,
         u.name
       FROM pool6.shop_follows f
       JOIN pool6.users u ON u.id = f.follower_id
       WHERE f.shop_id = $1
         AND (u.is_deleted = false OR u.is_deleted IS NULL)
         AND (u.is_suspended = false OR u.is_suspended IS NULL)
       ORDER BY f.created_at DESC
       LIMIT 200`,
      [shopId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load followers.' });
  }
});

router.get('/following-of/:userId', async (req, res) => {
  const userId = parseUserId(req.params.userId);
  if (!userId) return res.status(400).json({ error: 'Invalid shop.' });
  try {
    await ensureShopFollowsTable();
    const result = await pool.query(
      `SELECT
         u.id,
         COALESCE(NULLIF(u.shop_name, ''), u.name) AS display_name,
         u.shop_name,
         u.name,
         (
           SELECT COUNT(*)::int
           FROM pool6.listings l
           WHERE l.seller_id = u.id
             AND l.status = 'active'
             AND l.date_posted > NOW() - INTERVAL '7 days'
         ) AS new_listings
       FROM pool6.shop_follows f
       JOIN pool6.users u ON u.id = f.shop_id
       WHERE f.follower_id = $1
         AND (u.is_deleted = false OR u.is_deleted IS NULL)
         AND (u.is_suspended = false OR u.is_suspended IS NULL)
       ORDER BY f.created_at DESC
       LIMIT 200`,
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load following list.' });
  }
});

router.get('/status/:shopId', requireAuth, async (req, res) => {
  const shopId = parseUserId(req.params.shopId);
  if (!shopId) return res.status(400).json({ error: 'Invalid shop.' });
  try {
    await ensureShopFollowsTable();
    const result = await pool.query(
      `SELECT EXISTS(
         SELECT 1 FROM pool6.shop_follows WHERE follower_id = $1 AND shop_id = $2
       ) AS following`,
      [req.userId, shopId]
    );
    res.json({ following: Boolean(result.rows[0].following) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load follow status.' });
  }
});

router.post('/:shopId', requireAuth, async (req, res) => {
  const shopId = parseUserId(req.params.shopId);
  if (!shopId) return res.status(400).json({ error: 'Invalid shop.' });
  if (shopId === req.userId) {
    return res.status(400).json({ error: 'You cannot follow your own shop.' });
  }
  try {
    await ensureShopFollowsTable();
    const shop = await pool.query(
      `SELECT id FROM pool6.users
       WHERE id = $1
         AND (is_deleted = false OR is_deleted IS NULL)
         AND (is_suspended = false OR is_suspended IS NULL)`,
      [shopId]
    );
    if (shop.rows.length === 0) {
      return res.status(404).json({ error: 'Shop not found.' });
    }
    await pool.query(
      `INSERT INTO pool6.shop_follows (follower_id, shop_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [req.userId, shopId]
    );
    const counts = await getFollowCounts(shopId);
    res.status(201).json({ following: true, ...counts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not follow shop.' });
  }
});

router.delete('/:shopId', requireAuth, async (req, res) => {
  const shopId = parseUserId(req.params.shopId);
  if (!shopId) return res.status(400).json({ error: 'Invalid shop.' });
  try {
    await ensureShopFollowsTable();
    await pool.query(
      `DELETE FROM pool6.shop_follows WHERE follower_id = $1 AND shop_id = $2`,
      [req.userId, shopId]
    );
    const counts = await getFollowCounts(shopId);
    res.json({ following: false, ...counts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not unfollow shop.' });
  }
});

module.exports = { router, notifyShopFollowers, ensureShopFollowsTable, getFollowCounts };

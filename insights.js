const express = require('express');
const router = express.Router();
const pool = require('./db');
const requireAuth = require('./middleware');
const { ensureShopFollowsTable } = require('./follows');

router.get('/', requireAuth, async (req, res) => {
  try {
    await ensureShopFollowsTable();

    const [totalsResult, chatsResult, savesResult, followersResult, listingsResult, soldResult] = await Promise.all([
      pool.query(
        `SELECT
           COALESCE(SUM(view_count), 0)::int AS views,
           COUNT(*) FILTER (WHERE status = 'active')::int AS active
         FROM pool6.listings
         WHERE seller_id = $1`,
        [req.userId]
      ),
      pool.query(
        `SELECT COUNT(DISTINCT sender_id)::int AS chats
         FROM pool6.messages
         WHERE receiver_id = $1
           AND deleted_for_receiver = false
           AND deleted_for_everyone = false`,
        [req.userId]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS saves
         FROM pool6.favorites f
         JOIN pool6.listings l ON l.id = f.listing_id
         WHERE l.seller_id = $1`,
        [req.userId]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS followers
         FROM pool6.shop_follows
         WHERE shop_id = $1`,
        [req.userId]
      ),
      pool.query(
        `SELECT
           l.id, l.title, l.price, l.photos, l.status, l.view_count, l.boosted_until,
           (SELECT COUNT(*)::int FROM pool6.favorites f WHERE f.listing_id = l.id) AS saves,
           (SELECT COUNT(DISTINCT m.sender_id)::int
            FROM pool6.messages m
            WHERE m.listing_id = l.id
              AND m.sender_id <> l.seller_id
              AND m.deleted_for_everyone = false) AS chats
         FROM pool6.listings l
         WHERE l.seller_id = $1 AND l.status = 'active'
         ORDER BY l.date_posted DESC`,
        [req.userId]
      ),
      pool.query(
        `SELECT COALESCE(total_sold, 0)::int AS sold FROM pool6.users WHERE id = $1`,
        [req.userId]
      ),
    ]);

    const listings = listingsResult.rows.map((row) => ({
      ...row,
      view_count: row.view_count || 0,
      is_boosted: row.boosted_until && new Date(row.boosted_until) > new Date(),
    }));

    res.json({
      views: totalsResult.rows[0]?.views || 0,
      chats: chatsResult.rows[0]?.chats || 0,
      saves: savesResult.rows[0]?.saves || 0,
      followers: followersResult.rows[0]?.followers || 0,
      active: totalsResult.rows[0]?.active || 0,
      sold: soldResult.rows[0]?.sold || 0,
      listings,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load shop insights.' });
  }
});

module.exports = router;

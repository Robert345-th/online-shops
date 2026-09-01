const express = require('express');
const router = express.Router();
const pool = require('./db');
const requireAuth = require('./middleware');
const { sendPushNotification } = require('./notifications');
const { getSellerCompliance, getAppSettings } = require('./shop-verification');
const { notifyShopFollowers } = require('./follows');
const { notifySavedSearches, notifyListingWatchers, ensureMarketplaceTables } = require('./marketplace-extras');

function requiredSubCategory(categoryName) {
  if (categoryName === 'Cars') return 'Cars';
  if (categoryName === 'Land') return 'Land';
  return 'General';
}

let videoColumnReady = null;
async function ensureListingVideoColumn() {
  if (!videoColumnReady) {
    videoColumnReady = Promise.all([
      pool.query(`ALTER TABLE pool6.listings ADD COLUMN IF NOT EXISTS video_url TEXT`),
      pool.query(`ALTER TABLE pool6.listings ADD COLUMN IF NOT EXISTS compare_at_price NUMERIC`),
    ]).then(() => {}).catch((err) => {
      videoColumnReady = null;
      throw err;
    });
  }
  await videoColumnReady;
}

let feedIndexesReady = null;
async function ensureFeedIndexes() {
  if (!feedIndexesReady) {
    feedIndexesReady = pool.query(`
      CREATE INDEX IF NOT EXISTS listings_feed_posted_idx
        ON pool6.listings (date_posted DESC)
        WHERE status IN ('active', 'reserved');
      CREATE INDEX IF NOT EXISTS listings_seller_id_idx
        ON pool6.listings (seller_id);
      CREATE INDEX IF NOT EXISTS listings_category_id_idx
        ON pool6.listings (category_id);
      CREATE INDEX IF NOT EXISTS subscriptions_user_active_idx
        ON pool6.subscriptions (user_id, category)
        WHERE payment_status = 'active';
      CREATE INDEX IF NOT EXISTS messages_inbox_unread_idx
        ON pool6.messages (receiver_id)
        WHERE read_at IS NULL AND deleted_for_receiver = false AND deleted_for_everyone = false;
    `).then(() => {}).catch((err) => {
      feedIndexesReady = null;
      throw err;
    });
  }
  await feedIndexesReady;
}

let recentlyViewedReady = null;
async function ensureRecentlyViewedTable() {
  if (!recentlyViewedReady) {
    recentlyViewedReady = pool.query(`
      CREATE TABLE IF NOT EXISTS pool6.recently_viewed (
        user_id INTEGER NOT NULL REFERENCES pool6.users(id) ON DELETE CASCADE,
        listing_id INTEGER NOT NULL REFERENCES pool6.listings(id) ON DELETE CASCADE,
        viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, listing_id)
      );
      CREATE INDEX IF NOT EXISTS recently_viewed_user_viewed_idx
        ON pool6.recently_viewed (user_id, viewed_at DESC);
    `).then(() => {}).catch((err) => {
      recentlyViewedReady = null;
      throw err;
    });
  }
  await recentlyViewedReady;
}

async function recordRecentView(userId, listingId) {
  const uid = parseInt(userId, 10);
  const lid = parseInt(listingId, 10);
  if (!Number.isFinite(uid) || !Number.isFinite(lid) || uid <= 0 || lid <= 0) return;
  await ensureRecentlyViewedTable();
  await pool.query(
    `INSERT INTO pool6.recently_viewed (user_id, listing_id, viewed_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id, listing_id) DO UPDATE SET viewed_at = NOW()`,
    [uid, lid]
  );
  await pool.query(
    `DELETE FROM pool6.recently_viewed rv
     WHERE rv.user_id = $1
       AND rv.ctid NOT IN (
         SELECT ctid FROM pool6.recently_viewed
         WHERE user_id = $1
         ORDER BY viewed_at DESC
         LIMIT 12
       )`,
    [uid]
  );
}

function mapRecentRows(rows) {
  return slimListingPhotos(rows).map((row) => ({
    id: row.id,
    title: row.title,
    price: row.price,
    compare_at_price: row.compare_at_price,
    photo: Array.isArray(row.photos) && row.photos[0] ? row.photos[0] : null,
    photos: row.photos,
    video_url: row.video_url,
    status: row.status,
  }));
}

function slimListingPhotos(rows) {
  if (!Array.isArray(rows)) return rows;
  for (const row of rows) {
    if (Array.isArray(row.photos) && row.photos.length > 1) {
      row.photos = row.photos.slice(0, 1);
    }
  }
  return rows;
}

function graceStillActive(end) {
  return !end || Date.now() < new Date(end).getTime();
}

function normalizeVideoUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim().slice(0, 500);
  if (!/^https:\/\//i.test(trimmed)) return null;
  if (!/res\.cloudinary\.com/i.test(trimmed)) return null;
  if (!/\/video\/upload\//i.test(trimmed) && !/\.(mp4|webm|mov)(\?|$)/i.test(trimmed)) return null;
  return trimmed;
}

router.get('/', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  const offset = parseInt(req.query.offset) || 0;
  const sellerId = parseInt(req.query.seller_id, 10);
  const filterBySeller = Number.isFinite(sellerId) && sellerId > 0;
  const q = String(req.query.q || '').trim();
  const category = String(req.query.category || '').trim();
  const filterCategory = category && category !== 'All';

  try {
    await ensureListingVideoColumn();
    const settings = await getAppSettings();
    const params = [limit, offset];
    let extra = '';
    if (filterBySeller) {
      params.push(sellerId);
      extra += ` AND l.seller_id = $${params.length}`;
    }
    if (q) {
      params.push(`%${q}%`);
      extra += ` AND (l.title ILIKE $${params.length} OR COALESCE(l.location_label, '') ILIKE $${params.length} OR COALESCE(c.name, '') ILIKE $${params.length})`;
    }
    if (filterCategory) {
      params.push(category);
      extra += ` AND c.name = $${params.length}`;
    }
    if (!graceStillActive(settings.nrc_grace_period_end)) {
      extra += ` AND u.nrc_verified = true`;
    }
    if (!graceStillActive(settings.grace_period_end)) {
      extra += ` AND EXISTS (
        SELECT 1 FROM pool6.subscriptions s
        WHERE s.user_id = l.seller_id
          AND s.payment_status = 'active'
          AND s.end_date > NOW()
          AND s.category = CASE WHEN c.name IN ('Cars', 'Land') THEN c.name ELSE 'General' END
      )`;
    }

    const result = await pool.query(
      `
      SELECT l.id, l.title, l.price, l.compare_at_price,
             COALESCE(l.photos[1:1], '{}') AS photos, l.video_url, l.condition,
             l.status, l.date_posted, l.latitude, l.longitude, l.location_label,
             l.boosted_until, l.seller_id, l.view_count,
             c.name AS category,
             u.name AS seller_name, u.shop_name,
             u.account_type AS seller_account_type,
             u.shop_status AS seller_shop_status,
             u.nrc_verified AS seller_nrc_verified,
             (sub.user_id IS NOT NULL) AS seller_subscription_active
      FROM pool6.listings l
      LEFT JOIN pool6.categories c ON l.category_id = c.id
      LEFT JOIN pool6.users u ON l.seller_id = u.id
      LEFT JOIN (
        SELECT DISTINCT user_id
        FROM pool6.subscriptions
        WHERE payment_status = 'active' AND end_date > NOW()
      ) sub ON sub.user_id = u.id
      WHERE l.status IN ('active', 'reserved')
      AND (u.is_suspended = false OR u.is_suspended IS NULL)
      ${extra}
      ORDER BY
        CASE WHEN l.boosted_until IS NOT NULL AND l.boosted_until > NOW() THEN 0 ELSE 1 END,
        l.date_posted DESC
      LIMIT $1 OFFSET $2
    `,
      params
    );
    res.set('Cache-Control', (q || filterBySeller)
      ? 'private, max-age=8'
      : 'public, max-age=12, stale-while-revalidate=30');
    res.json(slimListingPhotos(result.rows));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load listings.' });
  }
});

// ADMIN ONLY — browse/search every listing regardless of status, seller
// suspension, or subscription compliance. Used by the "All Listings" admin
// tab so an admin can find and remove any post at any time, not just
// listings that have already been reported.
router.get('/admin/all', requireAuth, async (req, res) => {
  try {
    const adminCheck = await pool.query('SELECT is_admin FROM pool6.users WHERE id = $1', [req.userId]);
    if (!adminCheck.rows[0]?.is_admin) {
      return res.status(403).json({ error: 'Admin access only.' });
    }

    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    const offset = parseInt(req.query.offset) || 0;
    const search = (req.query.search || '').trim();

    const params = [limit, offset];
    let searchClause = '';
    if (search) {
      params.push(`%${search}%`);
      searchClause = `AND (l.title ILIKE $3 OR u.name ILIKE $3 OR u.shop_name ILIKE $3 OR u.phone ILIKE $3)`;
    }

    const result = await pool.query(
      `
      SELECT l.id, l.title, l.price, l.photos, l.video_url, l.status, l.date_posted,
             l.seller_id, c.name AS category,
             u.name AS seller_name, u.shop_name, u.phone AS seller_phone,
             u.is_suspended AS seller_suspended
      FROM pool6.listings l
      LEFT JOIN pool6.categories c ON l.category_id = c.id
      LEFT JOIN pool6.users u ON l.seller_id = u.id
      WHERE 1=1
      ${searchClause}
      ORDER BY l.date_posted DESC
      LIMIT $1 OFFSET $2
      `,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load listings.' });
  }
});

router.get('/mine/all', requireAuth, async (req, res) => {
  try {
    await ensureListingVideoColumn();
    const settingsResult = await pool.query('SELECT grace_period_end FROM pool6.app_settings WHERE id = 1');
    const gracePeriodEnd = settingsResult.rows[0]?.grace_period_end;
    const gracePeriodPassed = gracePeriodEnd && new Date() > new Date(gracePeriodEnd);

    const subResult = gracePeriodPassed
      ? await pool.query(
          `SELECT category FROM pool6.subscriptions WHERE user_id = $1 AND payment_status = 'active' AND end_date > NOW()`,
          [req.userId]
        )
      : { rows: [] };
    const activeCategories = subResult.rows.map((r) => r.category);

    const result = await pool.query(
      `SELECT l.id, l.title, l.description, l.price, l.compare_at_price, l.photos, l.video_url, l.condition,
              l.status, l.date_posted, l.location_label, l.category_id, l.boosted_until,
              l.view_count,
              c.name AS category
       FROM pool6.listings l
       LEFT JOIN pool6.categories c ON l.category_id = c.id
       WHERE l.seller_id = $1
       ORDER BY l.date_posted DESC`,
      [req.userId]
    );

    const listings = result.rows.map((l) => {
      const needed = requiredSubCategory(l.category);
      const isCovered = activeCategories.includes(needed);
      return {
        ...l,
        payment_disabled: gracePeriodPassed && !isCovered,
        is_boosted: l.boosted_until && new Date(l.boosted_until) > new Date(),
      };
    });

    res.json(listings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load your listings.' });
  }
});

router.get('/reports/pending', requireAuth, async (req, res) => {
  try {
    const adminCheck = await pool.query('SELECT is_admin FROM pool6.users WHERE id = $1', [req.userId]);
    if (!adminCheck.rows[0]?.is_admin) {
      return res.status(403).json({ error: 'Admin access only.' });
    }

    const result = await pool.query(
      `SELECT r.id, r.reason, r.date, r.status, l.id AS listing_id, l.title, u.name AS reporter_name
       FROM pool6.reports r
       JOIN pool6.listings l ON r.listing_id = l.id
       JOIN pool6.users u ON r.reported_by = u.id
       WHERE r.status = 'pending'
       ORDER BY r.date DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load reports.' });
  }
});

router.put('/reports/:reportId/dismiss', requireAuth, async (req, res) => {
  try {
    const adminCheck = await pool.query('SELECT is_admin FROM pool6.users WHERE id = $1', [req.userId]);
    if (!adminCheck.rows[0]?.is_admin) {
      return res.status(403).json({ error: 'Admin access only.' });
    }

    await pool.query(`UPDATE pool6.reports SET status = 'dismissed' WHERE id = $1`, [req.params.reportId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not dismiss report.' });
  }
});

router.get('/recent', requireAuth, async (req, res) => {
  try {
    await ensureRecentlyViewedTable();
    const result = await pool.query(
      `SELECT l.id, l.title, l.price, l.compare_at_price,
              COALESCE(l.photos[1:1], '{}') AS photos, l.video_url, l.status
       FROM pool6.recently_viewed rv
       JOIN pool6.listings l ON l.id = rv.listing_id
       WHERE rv.user_id = $1
         AND l.status IN ('active', 'reserved', 'sold')
       ORDER BY rv.viewed_at DESC
       LIMIT 12`,
      [req.userId]
    );
    res.json(mapRecentRows(result.rows));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load recently viewed.' });
  }
});

router.post('/recent', requireAuth, async (req, res) => {
  try {
    const raw = Array.isArray(req.body && req.body.listing_ids) ? req.body.listing_ids : [];
    const ids = [...new Set(raw.map((id) => parseInt(id, 10)).filter((id) => Number.isFinite(id) && id > 0))].slice(0, 12);
    for (let i = ids.length - 1; i >= 0; i--) {
      await recordRecentView(req.userId, ids[i]);
    }
    const result = await pool.query(
      `SELECT l.id, l.title, l.price, l.compare_at_price,
              COALESCE(l.photos[1:1], '{}') AS photos, l.video_url, l.status
       FROM pool6.recently_viewed rv
       JOIN pool6.listings l ON l.id = rv.listing_id
       WHERE rv.user_id = $1
         AND l.status IN ('active', 'reserved', 'sold')
       ORDER BY rv.viewed_at DESC
       LIMIT 12`,
      [req.userId]
    );
    res.json(mapRecentRows(result.rows));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not save recently viewed.' });
  }
});

router.post('/:id/view', async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE pool6.listings
       SET view_count = COALESCE(view_count, 0) + 1
       WHERE id = $1 AND status IN ('active', 'reserved')
       RETURNING view_count`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Listing not found.' });
    }
    const userId = requireAuth.userIdFromToken(req);
    if (userId) {
      recordRecentView(userId, req.params.id).catch((err) => {
        console.error('Could not save recently viewed:', err);
      });
    }
    res.json({ view_count: result.rows[0].view_count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not record view.' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    await ensureListingVideoColumn();
    const settings = await getAppSettings();
    const nrcFilter = graceStillActive(settings.nrc_grace_period_end)
      ? ''
      : ' AND u.nrc_verified = true';
    const result = await pool.query(
      `SELECT l.id, l.title, l.description, l.price, l.compare_at_price, l.photos, l.video_url, l.condition,
              l.status, l.date_posted, l.latitude, l.longitude, l.location_label,
              l.category_id, l.seller_id, l.boosted_until, l.view_count,
              c.name AS category,
              u.name AS seller_name,
              CASE WHEN u.is_admin THEN NULL ELSE u.phone END AS seller_phone,
              u.account_type AS seller_account_type, u.shop_name,
              u.shop_status AS seller_shop_status,
              u.nrc_verified AS seller_nrc_verified,
              EXISTS (
                SELECT 1 FROM pool6.subscriptions s
                WHERE s.user_id = u.id
                  AND s.payment_status = 'active'
                  AND s.end_date > NOW()
              ) AS seller_subscription_active,
              u.avg_reply_secs, u.reply_count
       FROM pool6.listings l
       LEFT JOIN pool6.categories c ON l.category_id = c.id
       LEFT JOIN pool6.users u ON l.seller_id = u.id
       WHERE l.id = $1
       ${nrcFilter}`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Listing not found.' });
    }

    const listing = result.rows[0];
    listing.is_boosted = listing.boosted_until && new Date(listing.boosted_until) > new Date();

    const extras = [];
    if (!graceStillActive(settings.grace_period_end)) {
      extras.push(
        pool.query(
          `SELECT 1 FROM pool6.subscriptions WHERE user_id = $1 AND category = $2 AND payment_status = 'active' AND end_date > NOW()`,
          [listing.seller_id, requiredSubCategory(listing.category)]
        ).then((subCheck) => {
          listing.payment_disabled = subCheck.rows.length === 0;
        })
      );
    } else {
      listing.payment_disabled = false;
    }

    if (listing.category === 'Cars') {
      extras.push(
        pool.query(
          'SELECT make, model, year, mileage FROM pool6.car_details WHERE listing_id = $1',
          [req.params.id]
        ).then((carResult) => {
          listing.car_details = carResult.rows[0] || null;
        })
      );
    }

    if (listing.category === 'Land') {
      extras.push(
        pool.query(
          'SELECT size, size_unit, title_deed_status FROM pool6.land_details WHERE listing_id = $1',
          [req.params.id]
        ).then((landResult) => {
          listing.land_details = landResult.rows[0] || null;
        })
      );
    }

    if (extras.length) await Promise.all(extras);
    res.set('Cache-Control', 'public, max-age=8, stale-while-revalidate=20');
    res.json(listing);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load listing.' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  const {
    title, description, price, category_id, photos, video_url, condition,
    latitude, longitude, location_label,
    car_details, land_details,
  } = req.body;

  if (!title || !price) {
    return res.status(400).json({ error: 'Title and price are required.' });
  }

  if (!condition || !['New', 'Pre-owned'].includes(condition)) {
    return res.status(400).json({ error: 'Please select whether the item is New or Pre-owned.' });
  }

  try {
    const compliance = await getSellerCompliance(req.userId);
    if (!compliance.found) {
      return res.status(404).json({ error: 'User not found.' });
    }

    if (!compliance.step1Approved) {
      const account = compliance.user;
      let message = 'You need to register your shop before you can post listings.';
      if (account.shop_status === 'pending') {
        message = 'Your shop registration is still being reviewed. You will be notified once approved.';
      } else if (account.shop_status === 'rejected') {
        message = 'Your shop registration was not approved. Please contact support.';
      }
      return res.status(403).json({
        error: message,
        needsShopRegistration: true,
        shopStatus: account.shop_status,
      });
    }

    if (!compliance.canPost) {
      return res.status(403).json({
        error: compliance.nrcGraceExpired && !compliance.nrcVerified
          ? 'Your NRC verification is required. Submit your documents or wait for admin approval.'
          : 'You cannot post listings right now.',
        needsNrcVerification: compliance.nrcGraceExpired && !compliance.nrcVerified,
      });
    }

    const settingsResult = await pool.query('SELECT grace_period_end FROM pool6.app_settings WHERE id = 1');
    const gracePeriodEnd = settingsResult.rows[0]?.grace_period_end;
    const gracePeriodPassed = gracePeriodEnd && new Date() > new Date(gracePeriodEnd);

    if (gracePeriodEnd) {
      let categoryName = 'General';
      if (category_id) {
        const catResult = await pool.query('SELECT name FROM pool6.categories WHERE id = $1', [category_id]);
        categoryName = catResult.rows[0]?.name || 'General';
      }
      const neededSub = requiredSubCategory(categoryName);

      let mustCheckSubscription = gracePeriodPassed;

      if (!mustCheckSubscription) {
        const countResult = await pool.query(
          'SELECT COUNT(*) FROM pool6.listings WHERE seller_id = $1',
          [req.userId]
        );
        const hasNoListings = parseInt(countResult.rows[0].count) === 0;
        mustCheckSubscription = hasNoListings;
      }

      if (mustCheckSubscription) {
        const subResult = await pool.query(
          `SELECT 1 FROM pool6.subscriptions WHERE user_id = $1 AND category = $2 AND payment_status = 'active' AND end_date > NOW()`,
          [req.userId, neededSub]
        );
        if (subResult.rows.length === 0) {
          return res.status(403).json({
            error: `A ${neededSub} subscription is required to post this listing.`,
            requiresSubscription: true,
          });
        }
      }
    }

    await ensureListingVideoColumn();
    const videoUrl = normalizeVideoUrl(video_url);

    const result = await pool.query(
      `INSERT INTO pool6.listings
        (seller_id, title, description, price, category_id, photos, video_url, condition, latitude, longitude, location_label)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [req.userId, title, description, price, category_id, photos || [], videoUrl, condition, latitude, longitude, location_label]
    );

    const listing = result.rows[0];

    if (car_details) {
      await pool.query(
        `INSERT INTO pool6.car_details (listing_id, make, model, year, mileage)
         VALUES ($1, $2, $3, $4, $5)`,
        [listing.id, car_details.make, car_details.model, car_details.year, car_details.mileage]
      );
    }

    if (land_details) {
      await pool.query(
        `INSERT INTO pool6.land_details (listing_id, size, size_unit, title_deed_status)
         VALUES ($1, $2, $3, $4)`,
        [listing.id, land_details.size, land_details.size_unit, land_details.title_deed_status]
      );
    }

    notifyShopFollowers(req.userId, listing);
    let categoryName = 'General';
    if (category_id) {
      const catRow = await pool.query('SELECT name FROM pool6.categories WHERE id = $1', [category_id]);
      categoryName = catRow.rows[0]?.name || 'General';
    }
    notifySavedSearches(req.userId, listing, categoryName);

    res.status(201).json(listing);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not create listing.' });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  const { title, description, price, category_id, photos, video_url, condition, car_details, land_details, latitude, longitude, location_label } = req.body;

  if (!condition || !['New', 'Pre-owned'].includes(condition)) {
    return res.status(400).json({ error: 'Please select whether the item is New or Pre-owned.' });
  }

  try {
    await ensureListingVideoColumn();
    const check = await pool.query(
      'SELECT seller_id, price, compare_at_price FROM pool6.listings WHERE id = $1',
      [req.params.id]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Listing not found.' });
    }

    if (Number(check.rows[0].seller_id) !== Number(req.userId)) {
      return res.status(403).json({ error: 'You can only edit your own listings.' });
    }

    const oldPrice = parseFloat(check.rows[0].price);
    const newPrice = parseFloat(price);
    let compareAt = parseFloat(check.rows[0].compare_at_price);
    if (!Number.isFinite(compareAt) || compareAt <= 0) compareAt = null;
    if (Number.isFinite(newPrice) && Number.isFinite(oldPrice) && newPrice < oldPrice) {
      compareAt = Math.max(oldPrice, compareAt || 0);
    } else if (Number.isFinite(newPrice) && Number.isFinite(compareAt) && newPrice >= compareAt) {
      compareAt = null;
    }

    await ensureListingVideoColumn();
    const videoUrl = normalizeVideoUrl(video_url);
    const lat = latitude == null || latitude === '' ? null : parseFloat(latitude);
    const lng = longitude == null || longitude === '' ? null : parseFloat(longitude);
    const loc = location_label != null ? (String(location_label).trim() || null) : null;

    const result = await pool.query(
      `UPDATE pool6.listings
       SET title = $1, description = $2, price = $3, category_id = $4, photos = $5, video_url = $6, condition = $7,
           latitude = $8, longitude = $9, location_label = $10, compare_at_price = $11
       WHERE id = $12
       RETURNING *`,
      [title, description, price, category_id, photos || [], videoUrl, condition,
       Number.isFinite(lat) ? lat : null, Number.isFinite(lng) ? lng : null, loc, compareAt, req.params.id]
    );

    if (car_details) {
      await pool.query(
        `INSERT INTO pool6.car_details (listing_id, make, model, year, mileage)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (listing_id) DO UPDATE SET make = $2, model = $3, year = $4, mileage = $5`,
        [req.params.id, car_details.make, car_details.model, car_details.year, car_details.mileage]
      );
    }

    if (land_details) {
      await pool.query(
        `INSERT INTO pool6.land_details (listing_id, size, size_unit, title_deed_status)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (listing_id) DO UPDATE SET size = $2, size_unit = $3, title_deed_status = $4`,
        [req.params.id, land_details.size, land_details.size_unit, land_details.title_deed_status]
      );
    }

    if (newPrice < oldPrice) {
      const favoriters = await pool.query(
        `SELECT user_id FROM pool6.favorites WHERE listing_id = $1`,
        [req.params.id]
      );

      const payload = {
        type: 'listing',
        listingId: parseInt(req.params.id, 10),
        url: `/listing.html?id=${req.params.id}`,
        tag: `price-${req.params.id}`,
      };
      const dropTitle = 'Price drop';
      const dropBody = `"${title}" dropped from K${oldPrice} to K${newPrice}`;

      for (const fav of favoriters.rows) {
        sendPushNotification(fav.user_id, dropTitle, dropBody, payload);
      }
      notifyListingWatchers(req.params.id, dropTitle, dropBody, payload);
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not update listing.' });
  }
});

router.post('/:id/report', requireAuth, async (req, res) => {
  const { reason } = req.body;

  if (!reason) {
    return res.status(400).json({ error: 'A reason is required.' });
  }

  try {
    await pool.query(
      `INSERT INTO pool6.reports (listing_id, reason, reported_by)
       VALUES ($1, $2, $3)`,
      [req.params.id, reason, req.userId]
    );
    res.status(201).json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not submit report.' });
  }
});

router.post('/:id/mark-sold', requireAuth, async (req, res) => {
  try {
    const check = await pool.query(
      'SELECT seller_id FROM pool6.listings WHERE id = $1',
      [req.params.id]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Listing not found.' });
    }

    if (Number(check.rows[0].seller_id) !== Number(req.userId)) {
      return res.status(403).json({ error: 'You can only mark your own listings as sold.' });
    }

    await pool.query(
      `ALTER TABLE pool6.listings ADD COLUMN IF NOT EXISTS sold_at TIMESTAMPTZ`
    );
    await pool.query(
      `UPDATE pool6.listings SET status = 'sold', sold_at = COALESCE(sold_at, NOW()) WHERE id = $1`,
      [req.params.id]
    );

    res.json({ success: true, status: 'sold' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not mark listing as sold.' });
  }
});

router.put('/:id/status', requireAuth, async (req, res) => {
  const status = String(req.body.status || '').toLowerCase();
  if (!['active', 'reserved', 'sold'].includes(status)) {
    return res.status(400).json({ error: 'Status must be active, reserved, or sold.' });
  }
  try {
    const check = await pool.query(
      'SELECT seller_id, status, title FROM pool6.listings WHERE id = $1',
      [req.params.id]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Listing not found.' });
    }
    if (Number(check.rows[0].seller_id) !== Number(req.userId)) {
      return res.status(403).json({ error: 'You can only update your own listings.' });
    }
    const prevStatus = check.rows[0].status;
    if (status === 'sold') {
      await pool.query(
        `ALTER TABLE pool6.listings ADD COLUMN IF NOT EXISTS sold_at TIMESTAMPTZ`
      );
      await pool.query(
        `UPDATE pool6.listings SET status = 'sold', sold_at = COALESCE(sold_at, NOW()) WHERE id = $1`,
        [req.params.id]
      );
    } else {
      await pool.query('UPDATE pool6.listings SET status = $1 WHERE id = $2', [status, req.params.id]);
    }
    if (status === 'active' && prevStatus && prevStatus !== 'active') {
      const title = check.rows[0].title || 'A listing';
      notifyListingWatchers(
        req.params.id,
        'Back on ZedMarket',
        `"${title}" is listed again.`,
        {
          type: 'listing',
          listingId: parseInt(req.params.id, 10),
          url: `/listing.html?id=${req.params.id}`,
          tag: `watch-${req.params.id}`,
        }
      );
    }
    res.json({ success: true, status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not update listing status.' });
  }
});

router.get('/:id/similar', async (req, res) => {
  try {
    const base = await pool.query(
      'SELECT id, category_id, price FROM pool6.listings WHERE id = $1',
      [req.params.id]
    );
    if (!base.rows.length) {
      return res.status(404).json({ error: 'Listing not found.' });
    }
    const item = base.rows[0];
    const result = await pool.query(
      `SELECT l.id, l.title, l.price, l.compare_at_price, COALESCE(l.photos[1:1], '{}') AS photos, l.video_url, l.location_label, l.status
       FROM pool6.listings l
       LEFT JOIN pool6.users u ON l.seller_id = u.id
       WHERE l.id <> $1
         AND l.status IN ('active', 'reserved')
         AND l.category_id = $2
         AND (u.is_suspended = false OR u.is_suspended IS NULL)
       ORDER BY ABS(COALESCE(l.price, 0) - $3), l.date_posted DESC
       LIMIT 8`,
      [item.id, item.category_id, item.price || 0]
    );
    res.json(slimListingPhotos(result.rows));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load similar listings.' });
  }
});

router.get('/:id/watch', requireAuth, async (req, res) => {
  try {
    await ensureMarketplaceTables();
    const result = await pool.query(
      `SELECT 1 FROM pool6.listing_watches WHERE user_id = $1 AND listing_id = $2`,
      [req.userId, req.params.id]
    );
    res.json({ watching: result.rows.length > 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load notify status.' });
  }
});

router.post('/:id/watch', requireAuth, async (req, res) => {
  try {
    await ensureMarketplaceTables();
    const listing = await pool.query(
      'SELECT id, seller_id FROM pool6.listings WHERE id = $1',
      [req.params.id]
    );
    if (!listing.rows.length) {
      return res.status(404).json({ error: 'Listing not found.' });
    }
    if (listing.rows[0].seller_id === req.userId) {
      return res.status(400).json({ error: 'You cannot watch your own listing.' });
    }
    await pool.query(
      `INSERT INTO pool6.listing_watches (user_id, listing_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [req.userId, req.params.id]
    );
    res.json({ watching: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not turn on notify.' });
  }
});

router.delete('/:id/watch', requireAuth, async (req, res) => {
  try {
    await ensureMarketplaceTables();
    await pool.query(
      `DELETE FROM pool6.listing_watches WHERE user_id = $1 AND listing_id = $2`,
      [req.userId, req.params.id]
    );
    res.json({ watching: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not turn off notify.' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT seller_id, title FROM pool6.listings WHERE id = $1',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Listing not found.' });
    }

    const adminCheck = await pool.query('SELECT is_admin FROM pool6.users WHERE id = $1', [req.userId]);
    const isAdmin = adminCheck.rows[0]?.is_admin;
    const isOwner = result.rows[0].seller_id === req.userId;

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'You can only delete your own listings.' });
    }

    await pool.query('DELETE FROM pool6.listings WHERE id = $1', [req.params.id]);

    if (isAdmin && !isOwner) {
      sendPushNotification(
        result.rows[0].seller_id,
        'Listing Removed',
        'Your post was removed by ZedMarket Admin.'
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not delete listing.' });
  }
});

module.exports = router;
module.exports.ensureListingVideoColumn = ensureListingVideoColumn;
module.exports.ensureFeedIndexes = ensureFeedIndexes;
module.exports.ensureRecentlyViewedTable = ensureRecentlyViewedTable;

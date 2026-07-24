const express = require('express');
const router = express.Router();
const pool = require('./db');
const requireAuth = require('./middleware');
const { sendPushNotification } = require('./notifications');

function requiredSubCategory(categoryName) {
  if (categoryName === 'Cars') return 'Cars';
  if (categoryName === 'Land') return 'Land';
  return 'General';
}

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT l.id, l.title, l.description, l.price, l.photos,
             l.status, l.date_posted, l.latitude, l.longitude, l.location_label,
             l.boosted_until, l.seller_id,
             c.name AS category,
             u.name AS seller_name, u.shop_name
      FROM pool6.listings l
      LEFT JOIN pool6.categories c ON l.category_id = c.id
      LEFT JOIN pool6.users u ON l.seller_id = u.id
      WHERE l.status = 'active'
      AND (u.is_suspended = false OR u.is_suspended IS NULL)
      AND (
        (SELECT grace_period_end FROM pool6.app_settings WHERE id = 1) IS NULL
        OR NOW() < (SELECT grace_period_end FROM pool6.app_settings WHERE id = 1)
        OR EXISTS (
          SELECT 1 FROM pool6.subscriptions s
          WHERE s.user_id = l.seller_id
          AND s.payment_status = 'active'
          AND s.end_date > NOW()
          AND s.category = CASE WHEN c.name IN ('Cars', 'Land') THEN c.name ELSE 'General' END
        )
      )
      ORDER BY
        CASE WHEN l.boosted_until IS NOT NULL AND l.boosted_until > NOW() THEN 0 ELSE 1 END,
        l.date_posted DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load listings.' });
  }
});

router.get('/mine/all', requireAuth, async (req, res) => {
  try {
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
      `SELECT l.id, l.title, l.description, l.price, l.photos,
              l.status, l.date_posted, l.location_label, l.category_id, l.boosted_until,
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

router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT l.id, l.title, l.description, l.price, l.photos,
              l.status, l.date_posted, l.latitude, l.longitude, l.location_label,
              l.category_id, l.seller_id, l.boosted_until,
              c.name AS category,
              u.name AS seller_name, u.phone AS seller_phone, u.account_type AS seller_account_type, u.shop_name
       FROM pool6.listings l
       LEFT JOIN pool6.categories c ON l.category_id = c.id
       LEFT JOIN pool6.users u ON l.seller_id = u.id
       WHERE l.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Listing not found.' });
    }

    const listing = result.rows[0];
    listing.is_boosted = listing.boosted_until && new Date(listing.boosted_until) > new Date();

    const settingsResult = await pool.query('SELECT grace_period_end FROM pool6.app_settings WHERE id = 1');
    const gracePeriodEnd = settingsResult.rows[0]?.grace_period_end;
    const gracePeriodPassed = gracePeriodEnd && new Date() > new Date(gracePeriodEnd);

    let paymentDisabled = false;
    if (gracePeriodPassed) {
      const needed = requiredSubCategory(listing.category);
      const subCheck = await pool.query(
        `SELECT 1 FROM pool6.subscriptions WHERE user_id = $1 AND category = $2 AND payment_status = 'active' AND end_date > NOW()`,
        [listing.seller_id, needed]
      );
      paymentDisabled = subCheck.rows.length === 0;
    }
    listing.payment_disabled = paymentDisabled;

    if (listing.category === 'Cars') {
      const carResult = await pool.query(
        'SELECT make, model, year, mileage FROM pool6.car_details WHERE listing_id = $1',
        [req.params.id]
      );
      listing.car_details = carResult.rows[0] || null;
    }

    if (listing.category === 'Land') {
      const landResult = await pool.query(
        'SELECT size, size_unit, title_deed_status FROM pool6.land_details WHERE listing_id = $1',
        [req.params.id]
      );
      listing.land_details = landResult.rows[0] || null;
    }

    res.json(listing);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load listing.' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  const {
    title, description, price, category_id, photos,
    latitude, longitude, location_label,
    car_details, land_details,
  } = req.body;

  if (!title || !price) {
    return res.status(400).json({ error: 'Title and price are required.' });
  }

  try {
    const userCheck = await pool.query(
      'SELECT account_type, shop_status FROM pool6.users WHERE id = $1',
      [req.userId]
    );
    const account = userCheck.rows[0];

    if (account.account_type !== 'shop' || account.shop_status !== 'approved') {
      let message = 'You need to register your shop before you can post listings.';
      if (account.shop_status === 'pending') {
        message = 'Your shop registration is still being reviewed. You will be notified once approved.';
      } else if (account.shop_status === 'rejected') {
        message = 'Your shop registration was not approved. Please contact support.';
      }
      return res.status(403).json({ error: message, needsShopRegistration: true, shopStatus: account.shop_status });
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

    const result = await pool.query(
      `INSERT INTO pool6.listings
        (seller_id, title, description, price, category_id, photos, latitude, longitude, location_label)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [req.userId, title, description, price, category_id, photos || [], latitude, longitude, location_label]
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

    res.status(201).json(listing);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not create listing.' });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  const { title, description, price, category_id, photos, car_details, land_details } = req.body;

  try {
    const check = await pool.query(
      'SELECT seller_id, price FROM pool6.listings WHERE id = $1',
      [req.params.id]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Listing not found.' });
    }

    if (check.rows[0].seller_id !== req.userId) {
      return res.status(403).json({ error: 'You can only edit your own listings.' });
    }

    const oldPrice = parseFloat(check.rows[0].price);
    const newPrice = parseFloat(price);

    const result = await pool.query(
      `UPDATE pool6.listings
       SET title = $1, description = $2, price = $3, category_id = $4, photos = $5
       WHERE id = $6
       RETURNING *`,
      [title, description, price, category_id, photos || [], req.params.id]
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

      for (const fav of favoriters.rows) {
        sendPushNotification(
          fav.user_id,
          '💸 Price Drop!',
          `"${title}" dropped from K${oldPrice} to K${newPrice} — a listing you saved.`,
          { type: 'chat' }
        );
      }
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

    if (check.rows[0].seller_id !== req.userId) {
      return res.status(403).json({ error: 'You can only mark your own listings as sold.' });
    }

    await pool.query('DELETE FROM pool6.listings WHERE id = $1', [req.params.id]);
    await pool.query('UPDATE pool6.users SET total_sold = total_sold + 1 WHERE id = $1', [req.userId]);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not mark listing as sold.' });
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
        `Your listing "${result.rows[0].title}" was removed for violating our policies.`
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not delete listing.' });
  }
});

module.exports = router;

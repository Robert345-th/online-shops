require('dotenv').config();
const express = require('express');
const compression = require('compression');
const cors = require('cors');
const cron = require('node-cron');
const pool = require('./db');
const { sendPushNotification } = require('./notifications');

const app = express();
app.use(compression());
app.use(cors({
  exposedHeaders: ['X-Account-Suspended'],
}));
app.use(express.json());

const authRoutes = require('./auth');
app.use('/auth', authRoutes);

const listingsRoutes = require('./listings');
app.use('/listings', listingsRoutes);

const favoritesRoutes = require('./favorites');
app.use('/favorites', favoritesRoutes);

const subscriptionsRoutes = require('./subscriptions');
app.use('/subscriptions', subscriptionsRoutes);

const adminRoutes = require('./admin');
app.use('/admin', adminRoutes);

const reviewsRoutes = require('./reviews');
app.use('/reviews', reviewsRoutes);

const { router: notificationsRoutes } = require('./notifications');
app.use('/notifications', notificationsRoutes);

const messagesRoutes = require('./messages');
app.use('/messages', messagesRoutes);

const settingsRoutes = require('./settings');
app.use('/settings', settingsRoutes);

const userReportsRoutes = require('./user-reports');
app.use('/user-reports', userReportsRoutes);

const boostRoutes = require('./boost');
app.use('/boost', boostRoutes);

const saleConfirmationsRoutes = require('./sale-confirmations');
app.use('/sale-confirmations', saleConfirmationsRoutes);

const wantedRoutes = require('./wanted');
app.use('/wanted', wantedRoutes);

const { router: followsRoutes, ensureShopFollowsTable } = require('./follows');
const { ensureLastSeenColumns } = require('./user-presence');
const { ensureMarketplaceTables } = require('./marketplace-extras');
const savedSearchesRoutes = require('./saved-searches');
app.use('/saved-searches', savedSearchesRoutes);
app.use('/follows', followsRoutes);

const insightsRoutes = require('./insights');
app.use('/insights', insightsRoutes);

app.get('/', (req, res) => {
  res.send('Online Shops server is running.');
});

async function sendSubscriptionReminders() {
  try {
    const result = await pool.query(
      `SELECT id, user_id, category, end_date
       FROM pool6.subscriptions
       WHERE payment_status = 'active'
       AND reminder_sent = false
       AND end_date <= NOW() + INTERVAL '3 days'
       AND end_date > NOW()`
    );

    for (const sub of result.rows) {
      const daysLeft = Math.ceil((new Date(sub.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      sendPushNotification(
        sub.user_id,
        '⏳ Subscription Expiring Soon',
        `Your ${sub.category} shop subscription expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}. Renew now to keep your listings live.`
      );

      await pool.query(`UPDATE pool6.subscriptions SET reminder_sent = true WHERE id = $1`, [sub.id]);
    }

    if (result.rows.length > 0) {
      console.log(`Sent ${result.rows.length} subscription reminder(s).`);
    }
  } catch (err) {
    console.error('Subscription reminder job failed:', err);
  }
}

// Runs once a day — only notifies users who have favorited at least one item,
// telling them about new listings in the categories they've shown interest in.
// Users with no favorites are skipped entirely (no generic/noise notifications).
async function sendDailyDigests() {
  try {
    const usersResult = await pool.query(
      `SELECT DISTINCT u.id
       FROM pool6.users u
       JOIN pool6.favorites f ON f.user_id = u.id
       WHERE u.digest_enabled = true
       AND u.push_token IS NOT NULL
       AND (u.is_deleted = false OR u.is_deleted IS NULL)
       AND (u.last_digest_sent IS NULL OR u.last_digest_sent < NOW() - INTERVAL '20 hours')`
    );

    let sentCount = 0;

    for (const user of usersResult.rows) {
      const categoriesResult = await pool.query(
        `SELECT DISTINCT c.name
         FROM pool6.favorites f
         JOIN pool6.listings l ON f.listing_id = l.id
         JOIN pool6.categories c ON l.category_id = c.id
         WHERE f.user_id = $1`,
        [user.id]
      );
      const favoriteCategories = categoriesResult.rows.map((r) => r.name);

      if (favoriteCategories.length === 0) {
        continue;
      }

      const countResult = await pool.query(
        `SELECT COUNT(*), c.name AS category
         FROM pool6.listings l
         JOIN pool6.categories c ON l.category_id = c.id
         WHERE l.status = 'active'
         AND l.date_posted > NOW() - INTERVAL '1 day'
         AND c.name = ANY($1)
         GROUP BY c.name
         ORDER BY COUNT(*) DESC
         LIMIT 1`,
        [favoriteCategories]
      );

      if (countResult.rows.length > 0 && parseInt(countResult.rows[0].count) > 0) {
        const topCategory = countResult.rows[0];
        const message = `🔔 ${topCategory.count} new ${topCategory.category} listing${topCategory.count === '1' ? '' : 's'} posted today — check them out!`;
        sendPushNotification(user.id, '📦 ZedMarket Digest', message);
        sentCount++;
        await pool.query(`UPDATE pool6.users SET last_digest_sent = NOW() WHERE id = $1`, [user.id]);
      }
      // If no new matching listings, skip silently without updating last_digest_sent,
      // so they'll be checked again next run instead of waiting a full day.
    }

    if (sentCount > 0) {
      console.log(`Sent ${sentCount} daily digest(s).`);
    }
  } catch (err) {
    console.error('Daily digest job failed:', err);
  }
}

// Runs once a day — auto-expires sale confirmation requests that have sat
// unanswered for 3+ days, so they don't linger forever, and lets the seller know.
async function expirePendingSaleConfirmations() {
  try {
    const result = await pool.query(
      `UPDATE pool6.sale_confirmations
       SET status = 'expired'
       WHERE status = 'pending'
       AND requested_at < NOW() - INTERVAL '3 days'
       RETURNING id, listing_title, seller_id`
    );

    for (const confirmation of result.rows) {
      sendPushNotification(
        confirmation.seller_id,
        'Confirmation Expired',
        `The buyer never responded to confirm "${confirmation.listing_title}". It won't count toward your sold total.`
      );
    }

    if (result.rows.length > 0) {
      console.log(`Expired ${result.rows.length} sale confirmation(s).`);
    }
  } catch (err) {
    console.error('Sale confirmation expiry job failed:', err);
  }
}

// Runs every hour — tells sellers when their listing's 24hr Boost has run out,
// so they know it's no longer at the top of the feed.
async function notifyExpiredBoosts() {
  try {
    const result = await pool.query(
      `SELECT id, title, seller_id
       FROM pool6.listings
       WHERE boosted_until IS NOT NULL
       AND boosted_until < NOW()
       AND boost_expiry_notified = false`
    );

    for (const listing of result.rows) {
      sendPushNotification(
        listing.seller_id,
        '🚀 Boost Ended',
        `Your Boost for "${listing.title}" has ended. It's no longer pinned to the top of the feed.`
      );

      await pool.query('UPDATE pool6.listings SET boost_expiry_notified = true WHERE id = $1', [listing.id]);
    }

    if (result.rows.length > 0) {
      console.log(`Notified ${result.rows.length} expired boost(s).`);
    }
  } catch (err) {
    console.error('Boost expiry notification job failed:', err);
  }
}

// Schedule: subscription reminders (9am), expire old confirmations (12pm), digests (6pm), boost expiry check (hourly)
cron.schedule('0 9 * * *', sendSubscriptionReminders);
cron.schedule('0 12 * * *', expirePendingSaleConfirmations);
cron.schedule('0 18 * * *', sendDailyDigests);
cron.schedule('0 * * * *', notifyExpiredBoosts);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  ensureShopFollowsTable().catch((err) => {
    console.error('Could not ensure shop_follows table:', err);
  });
  ensureLastSeenColumns().catch((err) => {
    console.error('Could not ensure last_seen columns:', err);
  });
  ensureMarketplaceTables().catch((err) => {
    console.error('Could not ensure marketplace tables:', err);
  });
  wantedRoutes.ensureWantedPhotosColumn().catch((err) => {
    console.error('Could not ensure wanted photos column:', err);
  });
  listingsRoutes.ensureListingVideoColumn().catch((err) => {
    console.error('Could not ensure listing video column:', err);
  });
  listingsRoutes.ensureFeedIndexes().catch((err) => {
    console.error('Could not ensure feed indexes:', err);
  });
  listingsRoutes.ensureRecentlyViewedTable().catch((err) => {
    console.error('Could not ensure recently viewed table:', err);
  });
  messagesRoutes.ensureOfferColumns().catch((err) => {
    console.error('Could not ensure offer columns:', err);
  });
});

const pool = require('./db');
const { sendPushNotification } = require('./notifications');

function subscriptionCategoryForName(categoryName) {
  if (categoryName === 'Cars') return 'Cars';
  if (categoryName === 'Land') return 'Land';
  return 'General';
}

function buildTitleSearchPattern(title) {
  const words = String(title || '')
    .split(/\s+/)
    .map((word) => word.replace(/[^a-zA-Z0-9]/g, ''))
    .filter((word) => word.length >= 4);
  const keyword = words[0] || String(title || '').trim().slice(0, 12);
  if (!keyword || keyword.length < 3) return null;
  return `%${keyword}%`;
}

async function notifyMatchingSellers(wantedPost, posterUserId) {
  const { id, title, category_id: categoryId, budget } = wantedPost;
  if (!title) return { notified: 0 };

  let categoryName = null;
  let subCategory = 'General';
  if (categoryId) {
    const catResult = await pool.query('SELECT name FROM pool6.categories WHERE id = $1', [categoryId]);
    categoryName = catResult.rows[0]?.name || null;
    subCategory = subscriptionCategoryForName(categoryName);
  }

  const titlePattern = categoryId ? null : buildTitleSearchPattern(title);
  if (!categoryId && !titlePattern) return { notified: 0 };

  const sellersResult = await pool.query(
    `
    SELECT DISTINCT seller_id FROM (
      SELECT l.seller_id
      FROM pool6.listings l
      JOIN pool6.users u ON l.seller_id = u.id
      WHERE l.status = 'active'
        AND l.seller_id != $1
        AND (u.is_suspended = false OR u.is_suspended IS NULL)
        AND u.account_type = 'shop'
        AND (
          ($2::int IS NOT NULL AND l.category_id = $2)
          OR ($2 IS NULL AND $3::text IS NOT NULL AND l.title ILIKE $3)
        )
      UNION
      SELECT s.user_id AS seller_id
      FROM pool6.subscriptions s
      JOIN pool6.users u ON s.user_id = u.id
      WHERE s.payment_status = 'active'
        AND s.end_date > NOW()
        AND s.user_id != $1
        AND (u.is_suspended = false OR u.is_suspended IS NULL)
        AND u.account_type = 'shop'
        AND $2::int IS NOT NULL
        AND s.category = $4
    ) matched
    LIMIT 100
    `,
    [posterUserId, categoryId || null, titlePattern, subCategory]
  );

  const posterResult = await pool.query('SELECT name FROM pool6.users WHERE id = $1', [posterUserId]);
  const posterName = posterResult.rows[0]?.name || 'Someone';
  const budgetText = budget ? ` · Budget K${budget}` : '';
  const preview = `${title}${budgetText}`.slice(0, 120);

  let notified = 0;
  for (const row of sellersResult.rows) {
    await sendPushNotification(
      row.seller_id,
      '🔍 New wanted post',
      `${posterName} is looking for: ${preview}`,
      { type: 'wanted', wantedId: id, url: '/wanted.html', tag: `wanted-${id}` }
    );
    notified += 1;
  }

  return { notified };
}

module.exports = { notifyMatchingSellers };

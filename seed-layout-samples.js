const pool = require('./db');

const PHOTOS = {
  phone: 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?auto=format&fit=crop&w=900&q=80',
  samsung: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=900&q=80',
  tv: 'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?auto=format&fit=crop&w=900&q=80',
  laptop: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=900&q=80',
  fridge: 'https://images.unsplash.com/photo-1571175443880-49e1d25b2bc5?auto=format&fit=crop&w=900&q=80',
  speaker: 'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?auto=format&fit=crop&w=900&q=80',
  car: 'https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?auto=format&fit=crop&w=900&q=80',
  hilux: 'https://images.unsplash.com/photo-1559416523-140ddc3d238c?auto=format&fit=crop&w=900&q=80',
  sofa: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=900&q=80',
  bed: 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=900&q=80',
  table: 'https://images.unsplash.com/photo-1533090481720-856c6e3c1fdc?auto=format&fit=crop&w=900&q=80',
  jersey: 'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=900&q=80',
  shoes: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80',
  dress: 'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=900&q=80',
  produce: 'https://images.unsplash.com/photo-1518977822534-7049a61ee0c2?auto=format&fit=crop&w=900&q=80',
  maize: 'https://images.unsplash.com/photo-1534483509719-3feaee7c44d3?auto=format&fit=crop&w=900&q=80',
  pram: 'https://images.unsplash.com/photo-1522771930-78848d9293e8?auto=format&fit=crop&w=900&q=80',
  generator: 'https://images.unsplash.com/photo-1581092795360-fd1ca04f0952?auto=format&fit=crop&w=900&q=80',
  chairs: 'https://images.unsplash.com/photo-1503602642458-232111445657?auto=format&fit=crop&w=900&q=80',
  bike: 'https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=900&q=80',
};

const TOWNS = {
  Lusaka: { lat: -15.3875, lng: 28.3228 },
  Kitwe: { lat: -12.8024, lng: 28.2132 },
  Ndola: { lat: -12.9587, lng: 28.6366 },
  Livingstone: { lat: -17.8419, lng: 25.8544 },
  Chipata: { lat: -13.6333, lng: 32.65 },
  Kabwe: { lat: -14.4469, lng: 28.4464 },
  Chingola: { lat: -12.529, lng: 27.8838 },
  Solwezi: { lat: -12.1681, lng: 26.3894 },
  Kasama: { lat: -10.2129, lng: 31.1808 },
  Mongu: { lat: -15.2484, lng: 23.1274 },
};

// Small town bump so the same item is not K-for-K identical everywhere.
const TOWN_PRICE = {
  Lusaka: 1.04,
  Kitwe: 1.02,
  Ndola: 1.0,
  Livingstone: 1.03,
  Chipata: 0.98,
  Kabwe: 0.97,
  Chingola: 1.01,
  Solwezi: 1.05,
  Kasama: 0.96,
  Mongu: 0.95,
};

function priceInTown(base, town) {
  const factor = TOWN_PRICE[town] || 1;
  const step = base >= 10000 ? 1000 : 10;
  return Math.max(step, Math.round((base * factor) / step) * step);
}

// Street / classifieds prices (Zambia 2026): used phones below shop retail,
// older used cars from local ads, mealie meal near ZamStats/JCTR.
const BASE_CATALOG = [
  ['iPhone 13', 6500, 'Electronics', 'phone', 'Lusaka', 'Pre-owned', 'Selling my iPhone 13. Battery is still fine.'],
  ['Samsung A54', 3800, 'Electronics', 'samsung', 'Kitwe', 'Pre-owned', 'Samsung A54, used but clean. No cracks.'],
  ['Tecno Spark 20', 2200, 'Electronics', 'phone', 'Ndola', 'New', 'Tecno Spark 20, still new in box.'],
  ['Hisense 32 inch TV', 2200, 'Electronics', 'tv', 'Lusaka', 'New', '32 inch Hisense. Working well.'],
  ['HP laptop', 4500, 'Electronics', 'laptop', 'Lusaka', 'Pre-owned', 'HP laptop for school or office. Used.'],
  ['PlayStation 4', 2800, 'Electronics', 'speaker', 'Kitwe', 'Pre-owned', 'PS4 with one pad. Used.'],
  ['Bluetooth speaker', 280, 'Electronics', 'speaker', 'Chipata', 'New', 'Small Bluetooth speaker. Loud enough.'],
  ['Fridge', 3500, 'Electronics', 'fridge', 'Ndola', 'Pre-owned', 'Fridge, used at home. Still cooling.'],
  ['Microwave', 750, 'Electronics', 'fridge', 'Kabwe', 'New', 'Microwave, barely used.'],
  ['Generator 2kVA', 5500, 'Electronics', 'generator', 'Solwezi', 'New', '2kVA generator. Good for load shedding.'],
  ['WiFi router', 250, 'Electronics', 'speaker', 'Lusaka', 'New', 'WiFi router. Simple home use.'],
  ['Tablet', 1200, 'Electronics', 'phone', 'Livingstone', 'Pre-owned', 'Android tablet, used for kids.'],
  ['Printer', 900, 'Electronics', 'laptop', 'Kitwe', 'Pre-owned', 'Home printer. Black ink was replaced.'],
  ['Car battery', 750, 'Electronics', 'generator', 'Chingola', 'New', 'Car battery, new.'],
  ['Extension reel', 150, 'Electronics', 'generator', 'Mongu', 'New', 'Extension reel, 20 metres.'],
  ['Toyota Corolla', 110000, 'Cars', 'car', 'Kitwe', 'Pre-owned', 'Toyota Corolla. Used, running.'],
  ['Nissan Tiida', 58000, 'Cars', 'car', 'Lusaka', 'Pre-owned', 'Nissan Tiida. Town car.'],
  ['Honda Fit', 55000, 'Cars', 'car', 'Ndola', 'Pre-owned', 'Honda Fit. Small, easy on fuel.'],
  ['Toyota Hilux', 280000, 'Cars', 'hilux', 'Solwezi', 'Pre-owned', 'Hilux, used for work. Not new.'],
  ['Toyota Vitz', 62000, 'Cars', 'car', 'Lusaka', 'Pre-owned', 'Vitz. Used daily.'],
  ['Mazda Demio', 52000, 'Cars', 'car', 'Kabwe', 'Pre-owned', 'Mazda Demio. Needs a small service.'],
  ['Toyota Allion', 105000, 'Cars', 'car', 'Kitwe', 'Pre-owned', 'Allion. Family car.'],
  ['Hiace bus', 130000, 'Cars', 'hilux', 'Chipata', 'Pre-owned', 'Hiace. Used for passengers.'],
  ['Sofa set', 2800, 'Furniture', 'sofa', 'Ndola', 'Pre-owned', 'Sofa set from the house. Used.'],
  ['Dining table', 2000, 'Furniture', 'table', 'Lusaka', 'Pre-owned', 'Dining table with chairs. Used.'],
  ['Bed and mattress', 1800, 'Furniture', 'bed', 'Kitwe', 'New', 'Bed and mattress. Still new.'],
  ['Wardrobe', 1400, 'Furniture', 'bed', 'Livingstone', 'Pre-owned', 'Wooden wardrobe. Used.'],
  ['Office chair', 400, 'Furniture', 'table', 'Lusaka', 'New', 'Office chair.'],
  ['Coffee table', 500, 'Furniture', 'table', 'Kasama', 'Pre-owned', 'Small coffee table. Used.'],
  ['Kitchen unit', 3200, 'Furniture', 'table', 'Ndola', 'New', 'Kitchen unit. Not fitted yet.'],
  ['Football jersey', 120, 'Clothing', 'jersey', 'Chipata', 'New', 'Football jersey. New.'],
  ['Men sneakers', 250, 'Clothing', 'shoes', 'Lusaka', 'New', 'Men sneakers. Size 42.'],
  ['Ladies dress', 180, 'Clothing', 'dress', 'Kitwe', 'New', 'Ladies dress. New.'],
  ['School shoes', 120, 'Clothing', 'shoes', 'Kabwe', 'New', 'School shoes. Size 5.'],
  ['Winter jacket', 280, 'Clothing', 'dress', 'Kasama', 'Pre-owned', 'Winter jacket. Used one season.'],
  ['Chitenge wraps', 90, 'Clothing', 'dress', 'Mongu', 'New', 'Chitenge wraps. New.'],
  ['Work boots', 350, 'Clothing', 'shoes', 'Chingola', 'New', 'Work boots. New.'],
  ['Baby clothes pack', 80, 'Clothing', 'dress', 'Lusaka', 'New', 'Pack of baby clothes.'],
  ['50kg maize', 280, 'Produce', 'maize', 'Chipata', 'New', '50kg maize grain. This season.'],
  ['Tomatoes crate', 120, 'Produce', 'produce', 'Lusaka', 'New', 'Crate of tomatoes. Fresh.'],
  ['Cooking oil 20L', 650, 'Produce', 'produce', 'Ndola', 'New', '20 litre cooking oil.'],
  ['Charcoal bags', 90, 'Produce', 'maize', 'Kabwe', 'New', 'Small bags of charcoal.'],
  ['Plastic chairs x4', 200, 'Furniture', 'chairs', 'Ndola', 'New', 'Four plastic chairs. New.'],
  ['Bicycle', 650, 'Electronics', 'bike', 'Kitwe', 'Pre-owned', 'Bicycle. Used, still riding.'],
  ['Standing fan', 280, 'Electronics', 'speaker', 'Lusaka', 'Pre-owned', 'Standing fan. Used at home.'],
  ['Clothes iron', 120, 'Electronics', 'generator', 'Chipata', 'New', 'Clothes iron. New.'],
  ['Baby pram', 350, 'Furniture', 'pram', 'Lusaka', 'Pre-owned', 'Baby pram. Used.'],
  ['Baby crib', 450, 'Furniture', 'bed', 'Kitwe', 'Pre-owned', 'Baby crib. Used.'],
  ['Gas stove', 900, 'Electronics', 'fridge', 'Livingstone', 'Pre-owned', 'Gas stove. Used in the kitchen.'],
  ['Water pump', 1800, 'Electronics', 'generator', 'Mongu', 'New', 'Water pump. New.'],
];

// 30 items × 10 towns = 300 extra ads. Unique titles. No land.
function buildExtraSamples() {
  const townNames = Object.keys(TOWNS);
  const templates = [
    ['Itel A18', 550, 'Electronics', 'phone', 'Pre-owned', 'Itel A18. Used, still working.'],
    ['Tecno Pop 8', 950, 'Electronics', 'phone', 'Pre-owned', 'Tecno Pop 8. Used daily.'],
    ['Tecno Spark 10', 1600, 'Electronics', 'phone', 'Pre-owned', 'Tecno Spark 10. No cracks.'],
    ['Infinix Hot 12', 1400, 'Electronics', 'phone', 'Pre-owned', 'Infinix Hot 12. Strong battery.'],
    ['Samsung A14', 2500, 'Electronics', 'samsung', 'Pre-owned', 'Samsung A14. Used, clean.'],
    ['iPhone 11', 3200, 'Electronics', 'phone', 'Pre-owned', 'iPhone 11. Face ID working.'],
    ['iPhone 12', 4500, 'Electronics', 'phone', 'Pre-owned', 'iPhone 12. Used, battery okay.'],
    ['Samsung A04', 1800, 'Electronics', 'samsung', 'New', 'Samsung A04. Still new.'],
    ['Hisense 32 inch TV', 2200, 'Electronics', 'tv', 'Pre-owned', '32 inch TV. Used at home.'],
    ['Skyworth 43 inch TV', 4200, 'Electronics', 'tv', 'Pre-owned', '43 inch TV. Working well.'],
    ['Dell laptop', 3800, 'Electronics', 'laptop', 'Pre-owned', 'Dell laptop. For school.'],
    ['DSTV decoder', 450, 'Electronics', 'speaker', 'Pre-owned', 'DSTV decoder. Used.'],
    ['Tiger 1kVA generator', 3800, 'Electronics', 'generator', 'New', 'Small Tiger generator. For lights.'],
    ['Kettle', 180, 'Electronics', 'fridge', 'New', 'Electric kettle. New.'],
    ['Toyota Vitz 2010', 62000, 'Cars', 'car', 'Pre-owned', 'Vitz 2010. Town car, used.'],
    ['Mazda Demio 2012', 52000, 'Cars', 'car', 'Pre-owned', 'Demio. Small, easy on fuel.'],
    ['Honda Fit 2011', 55000, 'Cars', 'car', 'Pre-owned', 'Honda Fit. Used daily.'],
    ['Toyota Corolla 2008', 95000, 'Cars', 'car', 'Pre-owned', 'Corolla 2008. Running.'],
    ['Toyota Premio', 98000, 'Cars', 'car', 'Pre-owned', 'Premio. Family car.'],
    ['Toyota Noah', 115000, 'Cars', 'car', 'Pre-owned', 'Noah. Used for family.'],
    ['Sofa 3 piece', 2500, 'Furniture', 'sofa', 'Pre-owned', '3 piece sofa. Used.'],
    ['Double bed', 1600, 'Furniture', 'bed', 'Pre-owned', 'Double bed. Used.'],
    ['Wardrobe 2 door', 1200, 'Furniture', 'bed', 'Pre-owned', '2 door wardrobe. Used.'],
    ['Dining 4 chairs', 1800, 'Furniture', 'table', 'Pre-owned', 'Dining table with 4 chairs.'],
    ['Football jersey', 120, 'Clothing', 'jersey', 'New', 'Football jersey. New.'],
    ['Ladies chitenge dress', 150, 'Clothing', 'dress', 'New', 'Chitenge dress. New.'],
    ['Canvas sneakers', 200, 'Clothing', 'shoes', 'New', 'Canvas sneakers. Size 41.'],
    ['School shoes size 4', 100, 'Clothing', 'shoes', 'New', 'School shoes. Size 4.'],
    ['Breakfast mealie meal 25kg', 250, 'Produce', 'maize', 'New', '25kg breakfast mealie meal.'],
    ['Roller mealie meal 25kg', 200, 'Produce', 'maize', 'New', '25kg roller mealie meal.'],
  ];
  const extra = [];
  for (const tmpl of templates) {
    for (const town of townNames) {
      const [name, basePrice, category, photo, condition, desc] = tmpl;
      extra.push([
        `${name} — ${town}`,
        priceInTown(basePrice, town),
        category,
        photo,
        town,
        condition,
        `${desc} Selling in ${town}.`,
      ]);
    }
  }
  return extra;
}

const CATALOG = BASE_CATALOG.concat(buildExtraSamples());

function catId(cats, name) {
  const row = cats.find((c) => c.name === name);
  return row ? row.id : (cats[0] && cats[0].id) || null;
}

function photoFor(key) {
  return PHOTOS[key] || PHOTOS.phone;
}

const SAMPLE_OWNER_PHONE = '0750076052';
const INSERT_CHUNK = 40;

async function findSampleOwner() {
  const result = await pool.query(
    `SELECT id, phone, shop_status, nrc_verified, account_type
       FROM pool6.users
      WHERE regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') LIKE '%750076052'
      ORDER BY id
      LIMIT 1`
  );
  return result.rows[0] || null;
}

async function ensureShopVerified(userId) {
  await pool.query(
    `UPDATE pool6.users SET
       name = 'Deborah Phiri',
       phone_verified = true,
       account_type = 'shop',
       shop_status = 'approved',
       shop_rejection_reason = NULL,
       nrc_verified = true,
       nrc_status = 'approved',
       shop_name = CASE
         WHEN shop_name IS NULL OR BTRIM(shop_name) = '' OR shop_name ILIKE '%robert%' THEN 'Deborah Phiri'
         ELSE shop_name
       END,
       city = COALESCE(NULLIF(BTRIM(city), ''), 'Lusaka'),
       province = COALESCE(NULLIF(BTRIM(province), ''), 'Lusaka Province'),
       location_label = COALESCE(NULLIF(BTRIM(location_label), ''), 'Lusaka')
     WHERE id = $1`,
    [userId]
  );
  for (const category of ['General', 'Cars']) {
    const active = await pool.query(
      `SELECT 1 FROM pool6.subscriptions
        WHERE user_id = $1 AND category = $2
          AND payment_status = 'active' AND end_date > NOW()
        LIMIT 1`,
      [userId, category]
    );
    if (active.rows.length) continue;
    await pool.query(
      `INSERT INTO pool6.subscriptions
         (user_id, category, plan_type, price, payment_status, transaction_ref, end_date)
       VALUES ($1, $2, 'monthly', 0, 'active', 'SAMPLE_SHOP', NOW() + INTERVAL '1 year')`,
      [userId, category]
    );
  }
}

async function insertChunk(ownerId, cats, rows, startIndex) {
  const values = [];
  const params = [];
  rows.forEach((item, j) => {
    const [title, price, category, photoKey, town, condition, description] = item;
    const place = TOWNS[town] || TOWNS.Lusaka;
    const o = j * 12;
    values.push(
      `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6}, $${o + 7}, $${o + 8}, $${o + 9}, $${o + 10}, 'active', NOW() - ($${o + 11} || ' minutes')::interval, true)`
    );
    params.push(
      ownerId,
      title,
      description,
      price,
      catId(cats, category),
      [photoFor(photoKey)],
      condition,
      place.lat,
      place.lng,
      town,
      String(startIndex + j)
    );
  });
  await pool.query(
    `INSERT INTO pool6.listings
      (seller_id, title, description, price, category_id, photos, condition,
       latitude, longitude, location_label, status, date_posted, is_layout_sample)
     VALUES ${values.join(', ')}`,
    params
  );
}

async function seedLayoutSampleListings() {
  await pool.query(
    `ALTER TABLE pool6.listings
       ADD COLUMN IF NOT EXISTS is_layout_sample BOOLEAN NOT NULL DEFAULT false`
  );

  const landSampleFilter = `
    is_layout_sample = true
    AND (
      title IN ('Plot in Kabulonga', 'Plot in Kitwe', 'Smallholding Chongwe', 'Stand in Ndola')
      OR category_id IN (SELECT id FROM pool6.categories WHERE name = 'Land')
    )`;
  await pool.query(
    `DELETE FROM pool6.land_details
      WHERE listing_id IN (SELECT id FROM pool6.listings WHERE ${landSampleFilter})`
  ).catch(() => {});
  await pool.query(`DELETE FROM pool6.listings WHERE ${landSampleFilter}`);

  const owner = await findSampleOwner();
  if (!owner) {
    console.log(`Skip sample listings: no account for ${SAMPLE_OWNER_PHONE}.`);
    return;
  }
  await ensureShopVerified(owner.id);
  console.log(`Sample listings shop ${SAMPLE_OWNER_PHONE} is approved (user ${owner.id}).`);

  await pool.query(
    `UPDATE pool6.listings
        SET seller_id = $1, is_layout_sample = true
      WHERE is_layout_sample = true
         OR description = 'zm_layout_sample'`,
    [owner.id]
  );

  const cats = (await pool.query('SELECT id, name FROM pool6.categories')).rows;
  const old = await pool.query(
    `SELECT id, title FROM pool6.listings
      WHERE is_layout_sample = true
         OR description = 'zm_layout_sample'`
  );
  const byTitle = new Map(CATALOG.map((row) => [row[0], row]));
  let updated = 0;

  for (const row of old.rows) {
    const item = byTitle.get(row.title);
    if (!item) continue;
    const [, price, category, photoKey, town, condition, description] = item;
    const place = TOWNS[town] || TOWNS.Lusaka;
    await pool.query(
      `UPDATE pool6.listings
          SET description = $2,
              price = $3,
              category_id = $4,
              photos = $5,
              condition = $6,
              latitude = $7,
              longitude = $8,
              location_label = $9,
              seller_id = $10,
              is_layout_sample = true
        WHERE id = $1`,
      [
        row.id,
        description,
        price,
        catId(cats, category),
        [photoFor(photoKey)],
        condition,
        place.lat,
        place.lng,
        town,
        owner.id,
      ]
    );
    updated += 1;
  }
  if (updated) console.log(`Updated ${updated} existing sample listing(s).`);

  const haveRows = await pool.query(
    'SELECT title FROM pool6.listings WHERE is_layout_sample = true OR description = $1',
    ['zm_layout_sample']
  );
  const haveTitles = new Set(haveRows.rows.map((r) => r.title));
  const toInsert = CATALOG.filter((item) => !haveTitles.has(item[0]));
  let added = 0;

  for (let i = 0; i < toInsert.length; i += INSERT_CHUNK) {
    const chunk = toInsert.slice(i, i + INSERT_CHUNK);
    await insertChunk(owner.id, cats, chunk, i);
    added += chunk.length;
  }
  if (added) console.log(`Added ${added} sample listing(s) on ${SAMPLE_OWNER_PHONE}.`);
}

module.exports = { seedLayoutSampleListings };

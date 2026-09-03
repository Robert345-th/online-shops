const pool = require('./db');
const RAW_PHOTO_POOLS = require('./sample-photo-pools.json');
const { describeListing, locationLabel, carSpecsFor } = require('./sample-ad-copy');

function photoAllowed(url) {
  const raw = String(url || '');
  if (!raw) return false;
  const u = raw.toLowerCase();
  if (/unsplash|pexels|picsum|loremflickr|placeholder/.test(u)) return false;
  let name = u;
  try {
    name = decodeURIComponent(raw).toLowerCase();
  } catch (_) {}
  const banned = [
    'woman', 'women', 'girl', 'portrait', 'selfie', 'people', 'person', 'crowd',
    'holding', 'student', 'mother', 'moeder', 'father',
    'dress-up_fun', 'great_day_in_new_york', 'anja_bavaria', 'anastasiia',
    'about_the_brand', 'fashion_brand', 'productive_evening', 'grizzly_gauntlet',
    'for_tora', 'playpad', 'iowa_state_fair', 'dzien_dziecka',
    'bathers', 'pride_parade', 'pram_pushers', 'kinderwagen_steekt',
    'repairer', 'live_fire', 'howitzer', 'press_conference',
    'space_of_my_own', 'news_studio', 'photothon', 'eames_demetrios',
    'walking_on_the', 'feet_on_the_seat', 'skinny_jeans', 'walk_in_the_snow',
    'bilbao_metro', 'alice_in_philcoland', 'berrit_arnold',
  ];
  return !banned.some((tok) => name.includes(tok));
}

const PHOTO_POOLS = Object.fromEntries(
  Object.entries(RAW_PHOTO_POOLS).map(([key, urls]) => [
    key,
    [...new Set((urls || []).filter(photoAllowed))],
  ])
);

const KIND_TO_POOL = {
  iphone: 'iphone',
  iphone12: 'iphone',
  samsung: 'samsung',
  tecno: 'tecno',
  tecno2: 'tecno',
  itel: 'itel',
  infinix: 'infinix',
  tablet: 'tablet',
  tv: 'tv',
  laptop: 'laptop',
  fridge: 'fridge',
  speaker: 'speaker',
  car: 'car',
  fit: 'fit',
  hilux: 'pickup',
  sofa: 'sofa',
  bed: 'bed',
  table: 'table',
  jersey: 'jersey',
  shoes: 'shoes',
  dress: 'dress',
  produce: 'produce',
  maize: 'maize',
  pram: 'pram',
  generator: 'generator',
  chairs: 'chair',
  bike: 'bike',
};

function assignUniquePhotos(rows) {
  const cursor = {};
  const used = new Set();
  const reuseAt = {};

  function take(poolName) {
    const bucket = (PHOTO_POOLS[poolName] || []).filter(photoAllowed);
    let i = cursor[poolName] || 0;
    while (i < bucket.length) {
      const url = bucket[i];
      i += 1;
      cursor[poolName] = i;
      if (photoAllowed(url) && !used.has(url)) {
        used.add(url);
        return url;
      }
    }
    // Reuse the same kind of photo. Never give a car picture to mealie meal.
    if (bucket.length) {
      const r = reuseAt[poolName] || 0;
      reuseAt[poolName] = r + 1;
      return bucket[r % bucket.length];
    }
    const fallback = (PHOTO_POOLS.android || []).filter(photoAllowed);
    return fallback[0] || '';
  }

  return rows.map((row) => {
    const copy = row.slice();
    copy[3] = take(KIND_TO_POOL[row[3]] || 'android');
    return copy;
  });
}

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
  ['iPhone 13', 6500, 'Electronics', 'iphone', 'Lusaka', 'Pre-owned', 'Selling my iPhone 13. Battery is still fine.'],
  ['Samsung A54', 3800, 'Electronics', 'samsung', 'Kitwe', 'Pre-owned', 'Samsung A54, used but clean. No cracks.'],
  ['Tecno Spark 20', 2200, 'Electronics', 'tecno2', 'Ndola', 'New', 'Tecno Spark 20, still new in box.'],
  ['Hisense 32 inch TV', 2200, 'Electronics', 'tv', 'Lusaka', 'New', '32 inch Hisense. Working well.'],
  ['HP laptop', 4500, 'Electronics', 'laptop', 'Lusaka', 'Pre-owned', 'HP laptop for school or office. Used.'],
  ['PlayStation 4', 2800, 'Electronics', 'speaker', 'Kitwe', 'Pre-owned', 'PS4 with one pad. Used.'],
  ['Bluetooth speaker', 280, 'Electronics', 'speaker', 'Chipata', 'New', 'Small Bluetooth speaker. Loud enough.'],
  ['Fridge', 3500, 'Electronics', 'fridge', 'Ndola', 'Pre-owned', 'Fridge, used at home. Still cooling.'],
  ['Microwave', 750, 'Electronics', 'fridge', 'Kabwe', 'New', 'Microwave, barely used.'],
  ['Generator 2kVA', 5500, 'Electronics', 'generator', 'Solwezi', 'New', '2kVA generator. Good for load shedding.'],
  ['WiFi router', 250, 'Electronics', 'speaker', 'Lusaka', 'New', 'WiFi router. Simple home use.'],
  ['Tablet', 1200, 'Electronics', 'tablet', 'Livingstone', 'Pre-owned', 'Android tablet, used for kids.'],
  ['Printer', 900, 'Electronics', 'laptop', 'Kitwe', 'Pre-owned', 'Home printer. Black ink was replaced.'],
  ['Car battery', 750, 'Electronics', 'generator', 'Chingola', 'New', 'Car battery, new.'],
  ['Extension reel', 150, 'Electronics', 'generator', 'Mongu', 'New', 'Extension reel, 20 metres.'],
  ['Honda Fit', 110000, 'Cars', 'fit', 'Ndola', 'Pre-owned', 'Honda Fit. Small, easy on fuel.'],
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

// Extra ads across 10 towns. Unique titles. One Honda Fit only. No land.
function buildExtraSamples() {
  const townNames = Object.keys(TOWNS);
  const templates = [
    ['Itel A18', 550, 'Electronics', 'itel', 'Pre-owned', 'Itel A18. Used, still working.'],
    ['Tecno Pop 8', 950, 'Electronics', 'tecno', 'Pre-owned', 'Tecno Pop 8. Used daily.'],
    ['Tecno Spark 10', 1600, 'Electronics', 'tecno2', 'Pre-owned', 'Tecno Spark 10. No cracks.'],
    ['Infinix Hot 12', 1400, 'Electronics', 'infinix', 'Pre-owned', 'Infinix Hot 12. Strong battery.'],
    ['Samsung A14', 2500, 'Electronics', 'samsung', 'Pre-owned', 'Samsung A14. Used, clean.'],
    ['iPhone 11', 3200, 'Electronics', 'iphone12', 'Pre-owned', 'iPhone 11. Face ID working.'],
    ['iPhone 12', 4500, 'Electronics', 'iphone12', 'Pre-owned', 'iPhone 12. Used, battery okay.'],
    ['Samsung A04', 1800, 'Electronics', 'samsung', 'New', 'Samsung A04. Still new.'],
    ['Hisense 32 inch TV', 2200, 'Electronics', 'tv', 'Pre-owned', '32 inch TV. Used at home.'],
    ['Skyworth 43 inch TV', 4200, 'Electronics', 'tv', 'Pre-owned', '43 inch TV. Working well.'],
    ['Dell laptop', 3800, 'Electronics', 'laptop', 'Pre-owned', 'Dell laptop. For school.'],
    ['DSTV decoder', 450, 'Electronics', 'speaker', 'Pre-owned', 'DSTV decoder. Used.'],
    ['Tiger 1kVA generator', 3800, 'Electronics', 'generator', 'New', 'Small Tiger generator. For lights.'],
    ['Kettle', 180, 'Electronics', 'fridge', 'New', 'Electric kettle. New.'],
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
      let price = priceInTown(basePrice, town);
      extra.push([
        `${name} — ${town}`,
        price,
        category,
        photo,
        town,
        condition,
        describeListing(`${name} — ${town}`, town),
      ]);
    }
  }
  return extra;
}

const CATALOG = assignUniquePhotos(
  BASE_CATALOG.concat(buildExtraSamples()).map((row) => {
    const copy = row.slice();
    copy[6] = describeListing(copy[0], copy[4]);
    return copy;
  })
);

function catId(cats, name) {
  const row = cats.find((c) => c.name === name);
  return row ? row.id : (cats[0] && cats[0].id) || null;
}

function photoFor(keyOrUrl) {
  if (keyOrUrl && String(keyOrUrl).indexOf('http') === 0) {
    return photoAllowed(keyOrUrl) ? keyOrUrl : ((PHOTO_POOLS.tecno && PHOTO_POOLS.tecno[0]) || '');
  }
  const bucket = (PHOTO_POOLS.android || []).filter(photoAllowed);
  return bucket[0] || (PHOTO_POOLS.tecno && PHOTO_POOLS.tecno[0]) || '';
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

function listingInsertParams(ownerId, cats, item, minutesAgo) {
  const [title, price, category, photoKey, town, condition, description] = item;
  const place = TOWNS[town] || TOWNS.Lusaka;
  return [
    ownerId,
    title,
    description,
    price,
    catId(cats, category),
    [photoFor(photoKey)],
    condition,
    place.lat,
    place.lng,
    locationLabel(title, town),
    String(minutesAgo),
  ];
}

async function insertOne(ownerId, cats, item, minutesAgo) {
  await pool.query(
    `INSERT INTO pool6.listings
      (seller_id, title, description, price, category_id, photos, condition,
       latitude, longitude, location_label, status, date_posted, is_layout_sample)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active', NOW() - ($11 || ' minutes')::interval, true)`,
    listingInsertParams(ownerId, cats, item, minutesAgo)
  );
}

async function insertChunk(ownerId, cats, rows, startIndex) {
  const paramsPerRow = 11;
  const values = [];
  const params = [];
  rows.forEach((item, j) => {
    const o = j * paramsPerRow;
    values.push(
      `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6}, $${o + 7}, $${o + 8}, $${o + 9}, $${o + 10}, 'active', NOW() - ($${o + 11} || ' minutes')::interval, true)`
    );
    params.push(...listingInsertParams(ownerId, cats, item, startIndex + j));
  });
  try {
    await pool.query(
      `INSERT INTO pool6.listings
        (seller_id, title, description, price, category_id, photos, condition,
         latitude, longitude, location_label, status, date_posted, is_layout_sample)
       VALUES ${values.join(', ')}`,
      params
    );
  } catch (err) {
    console.error(`Sample batch insert failed, inserting one by one: ${err.message}`);
    for (let j = 0; j < rows.length; j++) {
      await insertOne(ownerId, cats, rows[j], startIndex + j);
    }
  }
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

  const extraCarFilter = `
    is_layout_sample = true
    AND (
      title LIKE 'Honda Fit 2011%'
      OR (
        title <> 'Honda Fit'
        AND (
          category_id IN (SELECT id FROM pool6.categories WHERE name = 'Cars')
          OR title LIKE 'Toyota %'
          OR title LIKE 'Mazda Demio%'
          OR title LIKE 'Nissan Tiida%'
          OR title LIKE 'Hiace%'
        )
      )
    )`;
  await pool.query(
    `DELETE FROM pool6.car_details
      WHERE listing_id IN (SELECT id FROM pool6.listings WHERE ${extraCarFilter})`
  ).catch(() => {});
  await pool.query(`DELETE FROM pool6.listings WHERE ${extraCarFilter}`);

  await pool.query(
    `DELETE FROM pool6.listings
      WHERE is_layout_sample = true
        AND (
          photos::text ~* 'Bugatti|Veyron|Lotus|Lamborghini|Ferrari|Porsche|McLaren|Elise|Spyder|Corvette|Mustang|Camaro'
          OR photos::text ~* 'unsplash|pexels|picsum|loremflickr'
        )`
  );

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

  console.log(
    `Seeding sample catalog: ${CATALOG.length} titles (${CATALOG.length - BASE_CATALOG.length} extra).`
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
        locationLabel(row.title, town),
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
  else console.log(`Sample catalog already present (${haveTitles.size} existing).`);

  await seedCarDetails();
}

async function seedCarDetails() {
  const cars = CATALOG.filter((item) => item[2] === 'Cars');
  let n = 0;
  for (const item of cars) {
    const specs = carSpecsFor(item[0], item[4]);
    if (!specs) continue;
    const found = await pool.query(
      `SELECT id FROM pool6.listings
        WHERE is_layout_sample = true AND title = $1
        LIMIT 1`,
      [item[0]]
    );
    if (!found.rows[0]) continue;
    await pool.query(
      `INSERT INTO pool6.car_details (listing_id, make, model, year, mileage)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (listing_id) DO UPDATE
         SET make = EXCLUDED.make,
             model = EXCLUDED.model,
             year = EXCLUDED.year,
             mileage = EXCLUDED.mileage`,
      [found.rows[0].id, specs.make, specs.model, specs.year, specs.mileage]
    );
    n += 1;
  }
  if (n) console.log(`Filled car details on ${n} sample car listing(s).`);
}

module.exports = { seedLayoutSampleListings };

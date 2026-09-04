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
    'abandoned_tv', '1990s_television', '4_television', 'family_appliance',
    'efta00001773', 'tomato', 'canap', 'josepinism', 'claw_foot',
    'herter', 'antique_oak', 'antique_claw', '1963_frigidaire', 'hemingway',
    'altes_schlafzimmer', 'museum',
    'vivobook', 'asus_vivobook', 'laptop_computer.jpeg',
    'bottom-of-electric', 'heater-cable-defect', 'waterboiler-internal',
    'teardown', 'motherboard',
    'latitude_e6540', 'inspiron_1525',
    'panasonic_home_refrigerator', 'jla7',
    "n'oveen", 'philips_kettle.jpg', 'phillips_white', 'bollitore_elettrico',
    'lrm_20200521', 'aeg_kettle',
    'klippansofa', 'expandable_table', 'pasay_city',
    'compact_modern_fitted_kitchen', 'coffee_table_on_a_white_background',
    'covers_removed', 'epson-inkjet-printer', 'epson_stylus',
    'pallet_of_scrap', 'abandoned_electric_water_pump',
    'braunau-bezirksmuseum', 'carriagesled', 'stroller_%28psf', 'pushchair',
    'dog_stroller', 'raleigh_lady', '1930s',
    'amstrad_decoder', 'd-box-2', 'samsung_plasma',
    'charles_and_ray_eames', 'the_gables', 'airfryer_convert',
    'saskatoon_public_library', 'img_5693',
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
  iphone12: 'iphone12',
  iphone13: 'iphone13',
  samsung: 'samsungA',
  tecno: 'tecno',
  tecno2: 'spark20',
  spark20: 'spark20',
  samsungA: 'samsungA',
  itel: 'itel',
  infinix: 'infinix',
  tablet: 'tablet',
  tv: 'tv',
  laptop: 'hp',
  hp: 'hp',
  dell: 'dell',
  fridge: 'fridge',
  washer: 'washer',
  airfryer: 'airfryer',
  microwave: 'microwave',
  kettle: 'kettle',
  stove: 'stove',
  speaker: 'speaker',
  console: 'console',
  router: 'router',
  decoder: 'decoder',
  fan: 'fan',
  printer: 'printer',
  battery: 'battery',
  reel: 'reel',
  iron: 'iron',
  pump: 'pump',
  generator: 'generator',
  car: 'car',
  fit: 'fit',
  hilux: 'pickup',
  sofa: 'sofa',
  bed: 'bed',
  wardrobe: 'wardrobe',
  crib: 'crib',
  table: 'table',
  coffee: 'coffee',
  kitchen: 'kitchen',
  office: 'office',
  jersey: 'jersey',
  shoes: 'shoes',
  dress: 'dress',
  jacket: 'jacket',
  baby: 'baby',
  produce: 'produce',
  maize: 'maize',
  charcoal: 'charcoal',
  oil: 'oil',
  pram: 'pram',
  chairs: 'chair',
  bike: 'bike',
};

const PHOTOS_PER_LISTING = 5;

function assignUniquePhotos(rows) {
  const restCursor = {};
  const usedFirst = new Set();

  function takeMany(poolName, n) {
    const bucket = (PHOTO_POOLS[poolName] || []).filter(photoAllowed);
    const fallback = (PHOTO_POOLS.tecno || []).filter(photoAllowed);
    const src = bucket.length ? bucket : fallback;
    if (!src.length) return null;
    const first = src.find((url) => !usedFirst.has(url));
    if (!first) return null;
    usedFirst.add(first);
    const rest = src.filter((url) => url !== first);
    const cycle = rest.length ? rest : src;
    const out = [first];
    let i = restCursor[poolName] || 0;
    while (out.length < n) {
      out.push(cycle[i % cycle.length]);
      i += 1;
    }
    restCursor[poolName] = i;
    return out;
  }

  return rows
    .map((row) => {
      const copy = row.slice();
      const poolName = KIND_TO_POOL[row[3]] || row[3];
      copy[3] = takeMany(poolName, PHOTOS_PER_LISTING);
      return copy;
    })
    .filter((row) => Array.isArray(row[3]) && row[3].length === PHOTOS_PER_LISTING);
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
  ['iPhone 13', 6500, 'Electronics', 'iphone13', 'Lusaka', 'Pre-owned', 'Selling my iPhone 13. Battery is still fine.'],
  ['iPhone 12', 4500, 'Electronics', 'iphone12', 'Ndola', 'Pre-owned', 'iPhone 12. Used, battery okay.'],
  ['Samsung A54', 3800, 'Electronics', 'samsungA', 'Kitwe', 'Pre-owned', 'Samsung A54, used but clean. No cracks.'],
  ['Tecno Spark 20', 2200, 'Electronics', 'spark20', 'Chipata', 'New', 'Tecno Spark 20, still new in box.'],
  ['Hisense 32 inch TV', 2200, 'Electronics', 'tv', 'Lusaka', 'New', '32 inch Hisense. Working well.'],
  ['HP laptop', 4500, 'Electronics', 'hp', 'Lusaka', 'Pre-owned', 'HP laptop for school or office. Used.'],
  ['PlayStation 4', 2800, 'Electronics', 'console', 'Kitwe', 'Pre-owned', 'PS4 with one pad. Used.'],
  ['Bluetooth speaker', 280, 'Electronics', 'speaker', 'Chipata', 'New', 'Small Bluetooth speaker. Loud enough.'],
  ['Fridge', 3500, 'Electronics', 'fridge', 'Ndola', 'Pre-owned', 'Fridge, used at home. Still cooling.'],
  ['Microwave', 750, 'Electronics', 'microwave', 'Kabwe', 'New', 'Microwave, barely used.'],
  ['Generator 2kVA', 5500, 'Electronics', 'generator', 'Solwezi', 'New', '2kVA generator. Good for load shedding.'],
  ['WiFi router', 250, 'Electronics', 'router', 'Lusaka', 'New', 'WiFi router. Simple home use.'],
  ['Tablet', 1200, 'Electronics', 'tablet', 'Livingstone', 'Pre-owned', 'Android tablet, used for kids.'],
  ['Printer', 900, 'Electronics', 'printer', 'Kitwe', 'Pre-owned', 'Home printer. Black ink was replaced.'],
  ['Car battery', 750, 'Electronics', 'battery', 'Chingola', 'New', 'Car battery, new.'],
  ['Extension reel', 150, 'Electronics', 'reel', 'Mongu', 'New', 'Extension reel, 20 metres.'],
  ['Honda Fit', 110000, 'Cars', 'fit', 'Ndola', 'Pre-owned', 'Honda Fit. Small, easy on fuel.'],
  ['Sofa set', 2800, 'Furniture', 'sofa', 'Ndola', 'Pre-owned', 'Sofa set from the house. Used.'],
  ['Dining table', 2000, 'Furniture', 'table', 'Lusaka', 'New', 'Dining table with chairs. New.'],
  ['Bed and mattress', 1800, 'Furniture', 'bed', 'Kitwe', 'New', 'Bed and mattress. Still new.'],
  ['Washing machine', 4800, 'Electronics', 'washer', 'Livingstone', 'New', 'Front loader washing machine. New.'],
  ['Office chair', 400, 'Furniture', 'office', 'Lusaka', 'New', 'Office chair.'],
  ['Coffee table', 500, 'Furniture', 'coffee', 'Kasama', 'Pre-owned', 'Small coffee table. Used.'],
  ['Kitchen unit', 3200, 'Furniture', 'kitchen', 'Ndola', 'New', 'Kitchen unit. Not fitted yet.'],
  ['Football jersey', 120, 'Clothing', 'jersey', 'Chipata', 'New', 'Football jersey. New.'],
  ['Men sneakers', 250, 'Clothing', 'shoes', 'Lusaka', 'New', 'Men sneakers. Size 42.'],
  ['Ladies dress', 180, 'Clothing', 'dress', 'Kitwe', 'New', 'Ladies dress. New.'],
  ['School shoes', 120, 'Clothing', 'shoes', 'Kabwe', 'New', 'School shoes. Size 5.'],
  ['Winter jacket', 280, 'Clothing', 'jacket', 'Kasama', 'Pre-owned', 'Winter jacket. Used one season.'],
  ['Chitenge wraps', 90, 'Clothing', 'dress', 'Mongu', 'New', 'Chitenge wraps. New.'],
  ['Work boots', 350, 'Clothing', 'shoes', 'Chingola', 'New', 'Work boots. New.'],
  ['Baby clothes pack', 80, 'Clothing', 'baby', 'Lusaka', 'New', 'Pack of baby clothes.'],
  ['Air fryer', 650, 'Electronics', 'airfryer', 'Lusaka', 'New', 'Philips air fryer. New in box.'],
  ['Cooking oil 20L', 650, 'Produce', 'oil', 'Ndola', 'New', '20 litre cooking oil.'],
  ['Charcoal bags', 90, 'Produce', 'charcoal', 'Kabwe', 'New', 'Small bags of charcoal.'],
  ['Plastic chairs x4', 200, 'Furniture', 'chairs', 'Ndola', 'New', 'Four plastic chairs. New.'],
  ['Bicycle', 650, 'Electronics', 'bike', 'Kitwe', 'Pre-owned', 'Bicycle. Used, still riding.'],
  ['Standing fan', 280, 'Electronics', 'fan', 'Lusaka', 'Pre-owned', 'Standing fan. Used at home.'],
  ['Clothes iron', 120, 'Electronics', 'iron', 'Chipata', 'New', 'Clothes iron. New.'],
  ['Baby pram', 350, 'Furniture', 'pram', 'Lusaka', 'Pre-owned', 'Baby pram. Used.'],
  ['Baby crib', 450, 'Furniture', 'crib', 'Kitwe', 'Pre-owned', 'Baby crib. Used.'],
  ['Gas stove', 900, 'Electronics', 'stove', 'Livingstone', 'Pre-owned', 'Gas stove. Used in the kitchen.'],
];

// Extra ads across 10 towns. Unique titles. One Honda Fit only. No land.
function buildExtraSamples() {
  const townNames = Object.keys(TOWNS);
  const templates = [
    ['Dell laptop', 3800, 'Electronics', 'dell', 'Pre-owned', 'Dell laptop. For school.'],
    ['DSTV decoder', 450, 'Electronics', 'decoder', 'Pre-owned', 'DSTV decoder. Used.'],
    ['Tiger 1kVA generator', 3800, 'Electronics', 'generator', 'New', 'Small Tiger generator. For lights.'],
    ['Kettle', 180, 'Electronics', 'kettle', 'New', 'Electric kettle. New.'],
    ['Sofa 3 piece', 2500, 'Furniture', 'sofa', 'New', '3 piece sofa. New.'],
    ['Dining 4 chairs', 1800, 'Furniture', 'table', 'New', 'Dining table with 4 chairs. New.'],
    ['Football jersey', 120, 'Clothing', 'jersey', 'New', 'Football jersey. New.'],
    ['Ladies chitenge dress', 150, 'Clothing', 'dress', 'New', 'Chitenge dress. New.'],
    ['Canvas sneakers', 200, 'Clothing', 'shoes', 'New', 'Canvas sneakers. Size 41.'],
    ['School shoes size 4', 100, 'Clothing', 'shoes', 'New', 'School shoes. Size 4.'],
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

function padPhotos(urls) {
  const src = urls.filter(Boolean);
  if (!src.length) return [];
  const out = [];
  while (out.length < PHOTOS_PER_LISTING) {
    out.push(src[out.length % src.length]);
  }
  return out.slice(0, PHOTOS_PER_LISTING);
}

function photoFor(keyOrUrl) {
  const fallback = () => {
    const bucket = (PHOTO_POOLS.android || []).filter(photoAllowed);
    const one = bucket[0] || (PHOTO_POOLS.tecno && PHOTO_POOLS.tecno[0]) || '';
    return padPhotos(one ? [one] : []);
  };
  if (Array.isArray(keyOrUrl)) {
    const urls = [...new Set(keyOrUrl.filter((u) => photoAllowed(u)))];
    if (!urls.length) return fallback();
    return padPhotos(urls);
  }
  if (keyOrUrl && String(keyOrUrl).indexOf('http') === 0) {
    return photoAllowed(keyOrUrl) ? padPhotos([keyOrUrl]) : fallback();
  }
  return fallback();
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
    photoFor(photoKey),
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

  const droppedSampleFilter = `
    is_layout_sample = true
    AND (
      title = '50kg maize'
      OR title LIKE '50kg maize — %'
      OR title LIKE 'Breakfast mealie meal%'
      OR title LIKE 'Roller mealie meal%'
      OR title LIKE 'Double bed%'
      OR title LIKE 'Hisense 32 inch TV — %'
      OR title LIKE 'Skyworth%'
      OR title LIKE 'Itel %'
      OR title LIKE 'Tecno Pop%'
      OR title LIKE 'Tecno Spark 10%'
      OR title LIKE 'Tecno Spark 20 — %'
      OR title LIKE 'Infinix%'
      OR title LIKE 'Samsung A14%'
      OR title LIKE 'Samsung A04%'
      OR title LIKE 'Samsung A54 — %'
      OR title LIKE 'iPhone 11%'
      OR title LIKE 'iPhone 12 — %'
      OR title LIKE 'iPhone 13 — %'
      OR title = 'Tomatoes crate'
      OR title LIKE 'Tomatoes%'
      OR title = 'Wardrobe'
      OR title LIKE 'Wardrobe %'
      OR photos::text ~* 'Log_Furniture_Queen_Bed'
      OR photos::text ~* 'EFTA00001773'
      OR photos::text ~* 'Tomato'
      OR photos::text ~* 'Asus_vivobook'
      OR photos::text ~* 'Bottom-of-electric-kettle'
      OR photos::text ~* 'Laptop_computer.jpeg'
      OR photos::text ~* 'heater-cable-defect'
      OR title = 'Water pump'
      OR title LIKE 'Water pump — %'
      OR photos::text ~* 'Latitude_E6540'
      OR photos::text ~* 'Inspiron_1525'
      OR photos::text ~* 'Panasonic_HOME_REFRIGERATOR'
      OR photos::text ~* 'JLA7'
      OR photos::text ~* 'Klippansofa'
      OR photos::text ~* 'Expandable_table'
      OR photos::text ~* 'Pasay_City'
      OR photos::text ~* 'covers_removed'
      OR photos::text ~* 'Pallet_of_scrap'
      OR photos::text ~* 'Abandoned_electric_water_pump'
      OR photos::text ~* 'Braunau-Bezirksmuseum'
      OR photos::text ~* 'CarriageSled'
      OR photos::text ~* 'Raleigh_lady'
      OR photos::text ~* 'Amstrad_decoder'
      OR photos::text ~* 'D-Box-2'
      OR photos::text ~* 'Samsung_plasma'
      OR photos::text ~* 'The_Gables'
      OR photos::text ~* 'Airfryer_Convert'
      OR photos::text ~* 'AEG_kettle'
      OR photos::text ~* 'Epson-inkjet-printer'
    )`;
  await pool.query(
    `DELETE FROM pool6.listing_watches
      WHERE listing_id IN (SELECT id FROM pool6.listings WHERE ${droppedSampleFilter})`
  ).catch(() => {});
  await pool.query(`DELETE FROM pool6.listings WHERE ${droppedSampleFilter}`);

  await pool.query(
    `DELETE FROM pool6.listings
      WHERE is_layout_sample = true
        AND (
          photos::text ~* 'Bugatti|Veyron|Lotus|Lamborghini|Ferrari|Porsche|McLaren|Elise|Spyder|Corvette|Mustang|Camaro'
          OR photos::text ~* 'unsplash|pexels|picsum|loremflickr'
          OR photos::text ~* 'Abandoned_TV|1990s_Television|4_TELEVISION|Family_Appliance'
        )`
  );

  const catalogTitles = CATALOG.map((row) => row[0]);
  const leftoverSample = `
    is_layout_sample = true
    AND NOT (title = ANY($1::text[]))`;
  await pool.query(
    `DELETE FROM pool6.listing_watches
      WHERE listing_id IN (SELECT id FROM pool6.listings WHERE ${leftoverSample})`,
    [catalogTitles]
  ).catch(() => {});
  await pool.query(
    `DELETE FROM pool6.car_details
      WHERE listing_id IN (SELECT id FROM pool6.listings WHERE ${leftoverSample})`,
    [catalogTitles]
  ).catch(() => {});
  const pruned = await pool.query(
    `DELETE FROM pool6.listings WHERE ${leftoverSample} RETURNING title`,
    [catalogTitles]
  );
  if (pruned.rowCount) {
    console.log(`Removed ${pruned.rowCount} sample listing(s) that reused the same photo.`);
  }

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
        photoFor(photoKey),
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

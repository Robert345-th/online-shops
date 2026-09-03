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

const CATALOG = [
  ['iPhone 13', 6000, 'Electronics', 'phone', 'Lusaka', 'Pre-owned', 'Selling my iPhone 13. Battery is still fine.'],
  ['Samsung A54', 4200, 'Electronics', 'samsung', 'Kitwe', 'Pre-owned', 'Samsung A54, used but clean. No cracks.'],
  ['Tecno Spark 20', 1800, 'Electronics', 'phone', 'Ndola', 'New', 'Tecno Spark 20, still new in box.'],
  ['Hisense 32 inch TV', 2500, 'Electronics', 'tv', 'Lusaka', 'New', '32 inch Hisense. Working well.'],
  ['HP laptop', 5500, 'Electronics', 'laptop', 'Lusaka', 'Pre-owned', 'HP laptop for school or office. Used.'],
  ['PlayStation 4', 3200, 'Electronics', 'speaker', 'Kitwe', 'Pre-owned', 'PS4 with one pad. Used.'],
  ['Bluetooth speaker', 350, 'Electronics', 'speaker', 'Chipata', 'New', 'Small Bluetooth speaker. Loud enough.'],
  ['Fridge', 4800, 'Electronics', 'fridge', 'Ndola', 'Pre-owned', 'Fridge, used at home. Still cooling.'],
  ['Microwave', 900, 'Electronics', 'fridge', 'Kabwe', 'New', 'Microwave, barely used.'],
  ['Generator 2kVA', 6500, 'Electronics', 'generator', 'Solwezi', 'New', '2kVA generator. Good for load shedding.'],
  ['WiFi router', 280, 'Electronics', 'speaker', 'Lusaka', 'New', 'WiFi router. Simple home use.'],
  ['Tablet', 1500, 'Electronics', 'phone', 'Livingstone', 'Pre-owned', 'Android tablet, used for kids.'],
  ['Printer', 1100, 'Electronics', 'laptop', 'Kitwe', 'Pre-owned', 'Home printer. Black ink was replaced.'],
  ['Car battery', 850, 'Electronics', 'generator', 'Chingola', 'New', 'Car battery, new.'],
  ['Extension reel', 180, 'Electronics', 'generator', 'Mongu', 'New', 'Extension reel, 20 metres.'],
  ['Toyota Corolla', 85000, 'Cars', 'car', 'Kitwe', 'Pre-owned', 'Toyota Corolla. Used, running.'],
  ['Nissan Tiida', 42000, 'Cars', 'car', 'Lusaka', 'Pre-owned', 'Nissan Tiida. Town car.'],
  ['Honda Fit', 38000, 'Cars', 'car', 'Ndola', 'Pre-owned', 'Honda Fit. Small, easy on fuel.'],
  ['Toyota Hilux', 165000, 'Cars', 'hilux', 'Solwezi', 'Pre-owned', 'Hilux, used for work. Not new.'],
  ['Toyota Vitz', 45000, 'Cars', 'car', 'Lusaka', 'Pre-owned', 'Vitz. Used daily.'],
  ['Mazda Demio', 36000, 'Cars', 'car', 'Kabwe', 'Pre-owned', 'Mazda Demio. Needs a small service.'],
  ['Toyota Allion', 72000, 'Cars', 'car', 'Kitwe', 'Pre-owned', 'Allion. Family car.'],
  ['Hiace bus', 95000, 'Cars', 'hilux', 'Chipata', 'Pre-owned', 'Hiace. Used for passengers.'],
  ['Sofa set', 2400, 'Furniture', 'sofa', 'Ndola', 'Pre-owned', 'Sofa set from the house. Used.'],
  ['Dining table', 1800, 'Furniture', 'table', 'Lusaka', 'Pre-owned', 'Dining table with chairs. Used.'],
  ['Bed and mattress', 2200, 'Furniture', 'bed', 'Kitwe', 'New', 'Bed and mattress. Still new.'],
  ['Wardrobe', 1600, 'Furniture', 'bed', 'Livingstone', 'Pre-owned', 'Wooden wardrobe. Used.'],
  ['Office chair', 450, 'Furniture', 'table', 'Lusaka', 'New', 'Office chair.'],
  ['Coffee table', 600, 'Furniture', 'table', 'Kasama', 'Pre-owned', 'Small coffee table. Used.'],
  ['Kitchen unit', 3500, 'Furniture', 'table', 'Ndola', 'New', 'Kitchen unit. Not fitted yet.'],
  ['Football jersey', 150, 'Clothing', 'jersey', 'Chipata', 'New', 'Football jersey. New.'],
  ['Men sneakers', 280, 'Clothing', 'shoes', 'Lusaka', 'New', 'Men sneakers. Size 42.'],
  ['Ladies dress', 200, 'Clothing', 'dress', 'Kitwe', 'New', 'Ladies dress. New.'],
  ['School shoes', 180, 'Clothing', 'shoes', 'Kabwe', 'New', 'School shoes. Size 5.'],
  ['Winter jacket', 350, 'Clothing', 'dress', 'Kasama', 'Pre-owned', 'Winter jacket. Used one season.'],
  ['Chitenge wraps', 120, 'Clothing', 'dress', 'Mongu', 'New', 'Chitenge wraps. New.'],
  ['Work boots', 400, 'Clothing', 'shoes', 'Chingola', 'New', 'Work boots. New.'],
  ['Baby clothes pack', 90, 'Clothing', 'dress', 'Lusaka', 'New', 'Pack of baby clothes.'],
  ['50kg maize', 420, 'Produce', 'maize', 'Chipata', 'New', '50kg maize. This season.'],
  ['Tomatoes crate', 150, 'Produce', 'produce', 'Lusaka', 'New', 'Crate of tomatoes. Fresh.'],
  ['Cooking oil 20L', 680, 'Produce', 'produce', 'Ndola', 'New', '20 litre cooking oil.'],
  ['Charcoal bags', 80, 'Produce', 'maize', 'Kabwe', 'New', 'Bags of charcoal.'],
  ['Plastic chairs x4', 220, 'Furniture', 'chairs', 'Ndola', 'New', 'Four plastic chairs. New.'],
  ['Bicycle', 850, 'Electronics', 'bike', 'Kitwe', 'Pre-owned', 'Bicycle. Used, still riding.'],
  ['Standing fan', 380, 'Electronics', 'speaker', 'Lusaka', 'Pre-owned', 'Standing fan. Used at home.'],
  ['Clothes iron', 150, 'Electronics', 'generator', 'Chipata', 'New', 'Clothes iron. New.'],
  ['Baby pram', 400, 'Furniture', 'pram', 'Lusaka', 'Pre-owned', 'Baby pram. Used.'],
  ['Baby crib', 550, 'Furniture', 'bed', 'Kitwe', 'Pre-owned', 'Baby crib. Used.'],
  ['Gas stove', 1200, 'Electronics', 'fridge', 'Livingstone', 'Pre-owned', 'Gas stove. Used in the kitchen.'],
  ['Water pump', 2100, 'Electronics', 'generator', 'Mongu', 'New', 'Water pump. New.'],
];

function catId(cats, name) {
  const row = cats.find((c) => c.name === name);
  return row ? row.id : (cats[0] && cats[0].id) || null;
}

function photoFor(key) {
  return PHOTOS[key] || PHOTOS.phone;
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

  const old = await pool.query(
    `SELECT id, title FROM pool6.listings
      WHERE is_layout_sample = true
         OR description = 'zm_layout_sample'`
  );
  const byTitle = new Map(CATALOG.map((row) => [row[0], row]));

  for (const row of old.rows) {
    const item = byTitle.get(row.title);
    if (!item) continue;
    const [, , , photoKey, , , description] = item;
    await pool.query(
      `UPDATE pool6.listings
          SET description = $2,
              photos = $3,
              is_layout_sample = true
        WHERE id = $1`,
      [row.id, description, [photoFor(photoKey)]]
    );
  }

  const haveRows = await pool.query(
    'SELECT title FROM pool6.listings WHERE is_layout_sample = true OR description = $1',
    ['zm_layout_sample']
  );
  const haveTitles = new Set(haveRows.rows.map((r) => r.title));
  if (haveTitles.size >= CATALOG.length) {
    await pool.query(
      `UPDATE pool6.listings SET is_layout_sample = true WHERE description = 'zm_layout_sample'`
    );
    return;
  }

  const sellers = await pool.query(
    `SELECT seller_id
       FROM pool6.listings
      WHERE status = 'active'
      GROUP BY seller_id
      ORDER BY COUNT(*) DESC
      LIMIT 8`
  );
  if (!sellers.rows.length) {
    console.log('Skip sample listings: no active sellers to attach them to.');
    return;
  }

  const cats = (await pool.query('SELECT id, name FROM pool6.categories')).rows;
  const sellerIds = sellers.rows.map((r) => r.seller_id);
  let added = 0;

  for (let i = 0; i < CATALOG.length; i++) {
    const [title, price, category, photoKey, town, condition, description] = CATALOG[i];
    if (haveTitles.has(title)) continue;
    const place = TOWNS[town] || TOWNS.Lusaka;
    await pool.query(
      `INSERT INTO pool6.listings
        (seller_id, title, description, price, category_id, photos, condition,
         latitude, longitude, location_label, status, date_posted, is_layout_sample)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active', NOW() - ($11 || ' minutes')::interval, true)`,
      [
        sellerIds[i % sellerIds.length],
        title,
        description,
        price,
        catId(cats, category),
        [photoFor(photoKey)],
        condition,
        place.lat,
        place.lng,
        town,
        String(i),
      ]
    );
    added += 1;
  }
  if (added) console.log(`Added ${added} sample listing(s) to the feed.`);
}

module.exports = { seedLayoutSampleListings };

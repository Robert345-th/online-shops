const pool = require('./db');

const SAMPLE_MARK = 'zm_layout_sample';

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
  land: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=900&q=80',
  pram: 'https://images.unsplash.com/photo-1522771930-78848d9293e8?auto=format&fit=crop&w=900&q=80',
  generator: 'https://images.unsplash.com/photo-1581092795360-fd1ca04f0952?auto=format&fit=crop&w=900&q=80',
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
  ['iPhone 13', 6000, 'Electronics', 'phone', 'Lusaka', 'Pre-owned'],
  ['Samsung A54', 4200, 'Electronics', 'samsung', 'Kitwe', 'Pre-owned'],
  ['Tecno Spark 20', 1800, 'Electronics', 'phone', 'Ndola', 'New'],
  ['Hisense 32 inch TV', 2500, 'Electronics', 'tv', 'Lusaka', 'New'],
  ['HP laptop', 5500, 'Electronics', 'laptop', 'Lusaka', 'Pre-owned'],
  ['PlayStation 4', 3200, 'Electronics', 'speaker', 'Kitwe', 'Pre-owned'],
  ['Bluetooth speaker', 350, 'Electronics', 'speaker', 'Chipata', 'New'],
  ['Fridge', 4800, 'Electronics', 'fridge', 'Ndola', 'Pre-owned'],
  ['Microwave', 900, 'Electronics', 'fridge', 'Kabwe', 'New'],
  ['Generator 2kVA', 6500, 'Electronics', 'generator', 'Solwezi', 'New'],
  ['WiFi router', 280, 'Electronics', 'speaker', 'Lusaka', 'New'],
  ['Tablet', 1500, 'Electronics', 'phone', 'Livingstone', 'Pre-owned'],
  ['Printer', 1100, 'Electronics', 'laptop', 'Kitwe', 'Pre-owned'],
  ['Car battery', 850, 'Electronics', 'generator', 'Chingola', 'New'],
  ['Extension reel', 180, 'Electronics', 'generator', 'Mongu', 'New'],
  ['Toyota Corolla', 85000, 'Cars', 'car', 'Kitwe', 'Pre-owned'],
  ['Nissan Tiida', 42000, 'Cars', 'car', 'Lusaka', 'Pre-owned'],
  ['Honda Fit', 38000, 'Cars', 'car', 'Ndola', 'Pre-owned'],
  ['Toyota Hilux', 165000, 'Cars', 'hilux', 'Solwezi', 'Pre-owned'],
  ['Toyota Vitz', 45000, 'Cars', 'car', 'Lusaka', 'Pre-owned'],
  ['Mazda Demio', 36000, 'Cars', 'car', 'Kabwe', 'Pre-owned'],
  ['Toyota Allion', 72000, 'Cars', 'car', 'Kitwe', 'Pre-owned'],
  ['Hiace bus', 95000, 'Cars', 'hilux', 'Chipata', 'Pre-owned'],
  ['Sofa set', 2400, 'Furniture', 'sofa', 'Ndola', 'Pre-owned'],
  ['Dining table', 1800, 'Furniture', 'table', 'Lusaka', 'Pre-owned'],
  ['Bed and mattress', 2200, 'Furniture', 'bed', 'Kitwe', 'New'],
  ['Wardrobe', 1600, 'Furniture', 'bed', 'Livingstone', 'Pre-owned'],
  ['Office chair', 450, 'Furniture', 'table', 'Lusaka', 'New'],
  ['Coffee table', 600, 'Furniture', 'table', 'Kasama', 'Pre-owned'],
  ['Kitchen unit', 3500, 'Furniture', 'table', 'Ndola', 'New'],
  ['Football jersey', 150, 'Clothing', 'jersey', 'Chipata', 'New'],
  ['Men sneakers', 280, 'Clothing', 'shoes', 'Lusaka', 'New'],
  ['Ladies dress', 200, 'Clothing', 'dress', 'Kitwe', 'New'],
  ['School shoes', 180, 'Clothing', 'shoes', 'Kabwe', 'New'],
  ['Winter jacket', 350, 'Clothing', 'dress', 'Kasama', 'Pre-owned'],
  ['Chitenge wraps', 120, 'Clothing', 'dress', 'Mongu', 'New'],
  ['Work boots', 400, 'Clothing', 'shoes', 'Chingola', 'New'],
  ['Baby clothes pack', 90, 'Clothing', 'dress', 'Lusaka', 'New'],
  ['50kg maize', 420, 'Produce', 'maize', 'Chipata', 'New'],
  ['Tomatoes crate', 150, 'Produce', 'produce', 'Lusaka', 'New'],
  ['Cooking oil 20L', 680, 'Produce', 'produce', 'Ndola', 'New'],
  ['Charcoal bags', 80, 'Produce', 'maize', 'Kabwe', 'New'],
  ['Plot in Kabulonga', 180000, 'Land', 'land', 'Lusaka', 'New'],
  ['Plot in Kitwe', 65000, 'Land', 'land', 'Kitwe', 'New'],
  ['Smallholding Chongwe', 95000, 'Land', 'land', 'Lusaka', 'New'],
  ['Stand in Ndola', 40000, 'Land', 'land', 'Ndola', 'New'],
  ['Baby pram', 400, 'Furniture', 'pram', 'Lusaka', 'Pre-owned'],
  ['Baby crib', 550, 'Furniture', 'bed', 'Kitwe', 'Pre-owned'],
  ['Gas stove', 1200, 'Electronics', 'fridge', 'Livingstone', 'Pre-owned'],
  ['Water pump', 2100, 'Electronics', 'generator', 'Mongu', 'New'],
];

function catId(cats, name) {
  const row = cats.find((c) => c.name === name);
  return row ? row.id : (cats[0] && cats[0].id) || null;
}

async function seedLayoutSampleListings() {
  const existing = await pool.query(
    'SELECT COUNT(*)::int AS n FROM pool6.listings WHERE description = $1',
    [SAMPLE_MARK]
  );
  if ((existing.rows[0]?.n || 0) >= CATALOG.length) return;

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
  const have = existing.rows[0]?.n || 0;

  for (let i = have; i < CATALOG.length; i++) {
    const [title, price, category, photoKey, town, condition] = CATALOG[i];
    const place = TOWNS[town] || TOWNS.Lusaka;
    await pool.query(
      `INSERT INTO pool6.listings
        (seller_id, title, description, price, category_id, photos, condition,
         latitude, longitude, location_label, status, date_posted)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active', NOW() - ($11 || ' minutes')::interval)`,
      [
        sellerIds[i % sellerIds.length],
        title,
        SAMPLE_MARK,
        price,
        catId(cats, category),
        [PHOTOS[photoKey] || PHOTOS.phone],
        condition,
        place.lat,
        place.lng,
        town,
        String(i),
      ]
    );
  }
  console.log(`Added ${CATALOG.length - have} sample listing(s) to the feed.`);
}

module.exports = { seedLayoutSampleListings, SAMPLE_MARK };

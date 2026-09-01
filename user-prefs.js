const pool = require('./db');

const PREFS_MAX_BYTES = 200 * 1024;
const HTTP_URL = /^https?:\/\//i;

let prefsColumnReady = null;

async function ensureAppPrefsColumn() {
  if (!prefsColumnReady) {
    prefsColumnReady = pool.query(
      `ALTER TABLE pool6.users
       ADD COLUMN IF NOT EXISTS app_prefs JSONB NOT NULL DEFAULT '{}'::jsonb`
    ).catch((err) => {
      prefsColumnReady = null;
      throw err;
    });
  }
  await prefsColumnReady;
}

function asBoolString(value) {
  if (value === true || value === 'true' || value === '1') return 'true';
  if (value === false || value === 'false' || value === '0') return 'false';
  return undefined;
}

function asTrimmedString(value, max) {
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  return value.trim().slice(0, max);
}

function httpUrl(value) {
  if (typeof value !== 'string') return null;
  const url = value.trim();
  if (!url || !HTTP_URL.test(url) || url.length > 2000) return null;
  return url;
}

function sanitizeCoords(value) {
  if (value === null) return null;
  if (!value || typeof value !== 'object') return undefined;
  const lat = Number(value.lat);
  const lng = Number(value.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return undefined;
  const out = { lat, lng };
  const accuracy = Number(value.accuracy);
  if (Number.isFinite(accuracy) && accuracy >= 0) out.accuracy = accuracy;
  return out;
}

function sanitizeListingDraft(value) {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const photos = Array.isArray(value.photos)
    ? value.photos
        .map((photo) => {
          const url = httpUrl(photo && (photo.url || photo.uri || photo));
          return url ? { url } : null;
        })
        .filter(Boolean)
        .slice(0, 8)
    : [];
  return {
    step: value.step != null ? String(value.step).slice(0, 20) : undefined,
    photos,
    videoUrl: httpUrl(value.videoUrl) || '',
    categoryId: value.categoryId != null ? Number(value.categoryId) || null : null,
    condition: asTrimmedString(value.condition || '', 40) || '',
    landUnit: asTrimmedString(value.landUnit || '', 20) || '',
    coords: sanitizeCoords(value.coords) || null,
    locationLabel: asTrimmedString(value.locationLabel || '', 200) || '',
    listingFrom: asTrimmedString(value.listingFrom || '', 40) || '',
    title: asTrimmedString(value.title || '', 200) || '',
    price: asTrimmedString(value.price || '', 40) || '',
    description: asTrimmedString(value.description || '', 5000) || '',
    carMake: asTrimmedString(value.carMake || '', 80) || '',
    carModel: asTrimmedString(value.carModel || '', 80) || '',
    carYear: asTrimmedString(value.carYear || '', 12) || '',
    carMileage: asTrimmedString(value.carMileage || '', 40) || '',
    landSize: asTrimmedString(value.landSize || '', 40) || '',
    landDeedStatus: asTrimmedString(value.landDeedStatus || '', 40) || '',
  };
}

function sanitizeSoldTemplates(value) {
  if (value === null) return null;
  if (!Array.isArray(value)) return undefined;
  return value.slice(0, 5).map((item) => {
    if (!item || typeof item !== 'object') return null;
    const photos = Array.isArray(item.photos)
      ? item.photos.map(httpUrl).filter(Boolean).slice(0, 8)
      : [];
    return {
      title: asTrimmedString(item.title || '', 200) || '',
      description: asTrimmedString(item.description || '', 5000) || '',
      price: item.price != null && Number.isFinite(Number(item.price)) ? Number(item.price) : item.price || '',
      category: asTrimmedString(item.category || '', 80) || '',
      category_id: item.category_id != null ? Number(item.category_id) || null : null,
      condition: asTrimmedString(item.condition || '', 40) || '',
      location_label: asTrimmedString(item.location_label || '', 200) || '',
      photos,
      saved_at: Number(item.saved_at) || Date.now(),
    };
  }).filter(Boolean);
}

function sanitizePrefs(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const out = {};

  if (input.lang === 'en' || input.lang === 'bem' || input.lang === 'ny') {
    out.lang = input.lang;
  }

  const dark = asBoolString(input.dark_mode);
  if (dark !== undefined) out.dark_mode = dark;

  const lowData = asBoolString(input.low_data);
  if (lowData !== undefined) out.low_data = lowData;

  if (Object.prototype.hasOwnProperty.call(input, 'home_location')) {
    const coords = sanitizeCoords(input.home_location);
    if (coords !== undefined) out.home_location = coords;
  }

  if (Object.prototype.hasOwnProperty.call(input, 'location_label')) {
    const label = asTrimmedString(input.location_label, 200);
    if (label !== undefined) out.location_label = label;
  }

  if (Object.prototype.hasOwnProperty.call(input, 'listing_draft')) {
    const draft = sanitizeListingDraft(input.listing_draft);
    if (draft !== undefined) out.listing_draft = draft;
  }

  if (Object.prototype.hasOwnProperty.call(input, 'sold_templates')) {
    const templates = sanitizeSoldTemplates(input.sold_templates);
    if (templates !== undefined) out.sold_templates = templates;
  }

  if (Object.prototype.hasOwnProperty.call(input, 'selling_type')) {
    const sellingType = asTrimmedString(input.selling_type, 40);
    if (sellingType !== undefined) out.selling_type = sellingType;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'shop_city')) {
    const city = asTrimmedString(input.shop_city, 80);
    if (city !== undefined) out.shop_city = city;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'shop_province')) {
    const province = asTrimmedString(input.shop_province, 80);
    if (province !== undefined) out.shop_province = province;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'shop_location_label')) {
    const label = asTrimmedString(input.shop_location_label, 200);
    if (label !== undefined) out.shop_location_label = label;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'home_selling_label')) {
    const label = asTrimmedString(input.home_selling_label, 200);
    if (label !== undefined) out.home_selling_label = label;
  }

  return out;
}

function prefsFromUser(user) {
  const prefs = user && user.app_prefs;
  if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs)) return {};
  return prefs;
}

async function getUserPrefs(userId) {
  await ensureAppPrefsColumn();
  const result = await pool.query(
    `SELECT app_prefs FROM pool6.users WHERE id = $1`,
    [userId]
  );
  return prefsFromUser(result.rows[0]);
}

async function mergeUserPrefs(userId, patch) {
  await ensureAppPrefsColumn();
  const sanitized = sanitizePrefs(patch);
  if (!Object.keys(sanitized).length) {
    return getUserPrefs(userId);
  }
  const encoded = JSON.stringify(sanitized);
  if (Buffer.byteLength(encoded, 'utf8') > PREFS_MAX_BYTES) {
    const err = new Error('prefs_too_large');
    err.code = 'PREFS_TOO_LARGE';
    throw err;
  }
  const result = await pool.query(
    `UPDATE pool6.users
     SET app_prefs = COALESCE(app_prefs, '{}'::jsonb) || $2::jsonb
     WHERE id = $1
     RETURNING app_prefs`,
    [userId, encoded]
  );
  return prefsFromUser(result.rows[0]);
}

module.exports = {
  ensureAppPrefsColumn,
  getUserPrefs,
  mergeUserPrefs,
  prefsFromUser,
};

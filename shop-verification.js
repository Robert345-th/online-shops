const pool = require('./db');

const NRC_GRACE_DAYS = 5;

async function getAppSettings() {
  const result = await pool.query(
    'SELECT grace_period_end, nrc_grace_period_end, warning_message FROM pool6.app_settings WHERE id = 1'
  );
  return result.rows[0] || {};
}

function gracePeriodPassed(graceEnd) {
  return !!(graceEnd && new Date() > new Date(graceEnd));
}

function hasLocation(user) {
  const city = (user.city || '').trim();
  const province = (user.province || '').trim();
  const label = (user.location_label || user.shop_location_label || user.home_location_label || '').trim();
  if (city && province && label) return true;
  // Legacy shops approved before city/province fields were added
  if (user.shop_status === 'approved' && !city && !province && (user.shop_name || label)) {
    return true;
  }
  return false;
}

function nrcDocumentsSubmitted(user) {
  return !!(
    user.nrc_photo_url &&
    user.nrc_back_photo_url &&
    user.selfie_photo_url
  );
}

function isNrcVerified(user) {
  return user.nrc_verified === true;
}

function isShopStep1Approved(user) {
  return user.account_type === 'shop' && user.shop_status === 'approved';
}

async function getSellerCompliance(userId) {
  const result = await pool.query(
    `SELECT account_type, shop_status, shop_rejection_reason, shop_name,
            city, province, location_label, shop_location_label, home_location_label,
            nrc_number, nrc_photo_url, nrc_back_photo_url, selfie_photo_url,
            nrc_verified, nrc_status
     FROM pool6.users WHERE id = $1`,
    [userId]
  );
  const user = result.rows[0];
  if (!user) {
    return { found: false };
  }

  const settings = await getAppSettings();
  const nrcGraceEnd = settings.nrc_grace_period_end;
  const nrcGraceActive = !!nrcGraceEnd;
  const nrcGraceExpired = gracePeriodPassed(nrcGraceEnd);

  return {
    found: true,
    user,
  // Location is collected at registration; do not block posting until NRC grace expires.
  canPost: isShopStep1Approved(user) && (!nrcGraceExpired || isNrcVerified(user)),
    step1Approved: isShopStep1Approved(user),
    hasLocation: hasLocation(user),
    nrcGraceEnd,
    nrcGraceActive,
    nrcGraceExpired,
    nrcSubmitted: nrcDocumentsSubmitted(user),
    nrcVerified: isNrcVerified(user),
    nrcStatus: user.nrc_status || null,
    listingsPublic: isShopStep1Approved(user) && (!nrcGraceExpired || isNrcVerified(user)),
  };
}

function sellerListingsVisibleSql(alias = 'u') {
  return `(
    (SELECT nrc_grace_period_end FROM pool6.app_settings WHERE id = 1) IS NULL
    OR NOW() < (SELECT nrc_grace_period_end FROM pool6.app_settings WHERE id = 1)
    OR ${alias}.nrc_verified = true
  )`;
}

module.exports = {
  NRC_GRACE_DAYS,
  getAppSettings,
  gracePeriodPassed,
  hasLocation,
  nrcDocumentsSubmitted,
  isNrcVerified,
  isShopStep1Approved,
  getSellerCompliance,
  sellerListingsVisibleSql,
};

-- Run once on the production database before deploying the NRC verification update.

ALTER TABLE pool6.users
  ADD COLUMN IF NOT EXISTS nrc_verified BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE pool6.users
  ADD COLUMN IF NOT EXISTS nrc_status VARCHAR(20);

ALTER TABLE pool6.users
  ADD COLUMN IF NOT EXISTS city VARCHAR(120);

ALTER TABLE pool6.users
  ADD COLUMN IF NOT EXISTS province VARCHAR(120);

ALTER TABLE pool6.users
  ADD COLUMN IF NOT EXISTS date_of_birth DATE;

ALTER TABLE pool6.users
  ADD COLUMN IF NOT EXISTS selling_type VARCHAR(20);

ALTER TABLE pool6.users
  ADD COLUMN IF NOT EXISTS shop_address VARCHAR(255);

ALTER TABLE pool6.users
  ADD COLUMN IF NOT EXISTS home_address VARCHAR(255);

ALTER TABLE pool6.users
  ADD COLUMN IF NOT EXISTS shop_location_label VARCHAR(255);

ALTER TABLE pool6.users
  ADD COLUMN IF NOT EXISTS home_location_label VARCHAR(255);

ALTER TABLE pool6.users
  ADD COLUMN IF NOT EXISTS location_label VARCHAR(255);

ALTER TABLE pool6.app_settings
  ADD COLUMN IF NOT EXISTS nrc_grace_period_end TIMESTAMPTZ;

-- Existing approved shops already completed step 1; NRC not yet verified until admin approves.
UPDATE pool6.users
SET nrc_verified = FALSE
WHERE account_type = 'shop' AND shop_status = 'approved' AND nrc_verified IS NULL;

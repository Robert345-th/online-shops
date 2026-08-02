-- Run once on production before deploying listing view counts.

ALTER TABLE pool6.listings
  ADD COLUMN IF NOT EXISTS view_count INTEGER NOT NULL DEFAULT 0;

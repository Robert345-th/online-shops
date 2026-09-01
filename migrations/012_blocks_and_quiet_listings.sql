CREATE TABLE IF NOT EXISTS pool6.blocked_users (
  blocker_id INTEGER NOT NULL REFERENCES pool6.users(id) ON DELETE CASCADE,
  blocked_id INTEGER NOT NULL REFERENCES pool6.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

ALTER TABLE pool6.listings
  ADD COLUMN IF NOT EXISTS refreshed_at TIMESTAMPTZ;

UPDATE pool6.listings
   SET refreshed_at = COALESCE(refreshed_at, date_posted, NOW())
 WHERE refreshed_at IS NULL;

CREATE INDEX IF NOT EXISTS listings_quiet_scan_idx
  ON pool6.listings (status, refreshed_at)
  WHERE status = 'active';

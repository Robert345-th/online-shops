CREATE TABLE IF NOT EXISTS pool6.recently_viewed (
  user_id INTEGER NOT NULL REFERENCES pool6.users(id) ON DELETE CASCADE,
  listing_id INTEGER NOT NULL REFERENCES pool6.listings(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, listing_id)
);
CREATE INDEX IF NOT EXISTS recently_viewed_user_viewed_idx
  ON pool6.recently_viewed (user_id, viewed_at DESC);

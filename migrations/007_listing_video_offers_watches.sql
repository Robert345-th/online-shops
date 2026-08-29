ALTER TABLE pool6.listings ADD COLUMN IF NOT EXISTS video_url TEXT;

ALTER TABLE pool6.messages ADD COLUMN IF NOT EXISTS offer_amount NUMERIC;
ALTER TABLE pool6.messages ADD COLUMN IF NOT EXISTS offer_status TEXT;

CREATE TABLE IF NOT EXISTS pool6.listing_watches (
  user_id INTEGER NOT NULL REFERENCES pool6.users(id) ON DELETE CASCADE,
  listing_id INTEGER NOT NULL REFERENCES pool6.listings(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, listing_id)
);
CREATE INDEX IF NOT EXISTS listing_watches_listing_id_idx ON pool6.listing_watches (listing_id);

-- Shop follows: buyers get notified when a shop they follow posts a listing.

CREATE TABLE IF NOT EXISTS pool6.shop_follows (
  follower_id INTEGER NOT NULL REFERENCES pool6.users(id) ON DELETE CASCADE,
  shop_id INTEGER NOT NULL REFERENCES pool6.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (follower_id, shop_id),
  CONSTRAINT shop_follows_no_self CHECK (follower_id <> shop_id)
);

CREATE INDEX IF NOT EXISTS shop_follows_shop_id_idx ON pool6.shop_follows (shop_id);

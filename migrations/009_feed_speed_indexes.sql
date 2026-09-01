ALTER TABLE pool6.listings ADD COLUMN IF NOT EXISTS compare_at_price NUMERIC;

CREATE INDEX IF NOT EXISTS listings_feed_posted_idx
  ON pool6.listings (date_posted DESC)
  WHERE status IN ('active', 'reserved');

CREATE INDEX IF NOT EXISTS listings_seller_id_idx
  ON pool6.listings (seller_id);

CREATE INDEX IF NOT EXISTS listings_category_id_idx
  ON pool6.listings (category_id);

CREATE INDEX IF NOT EXISTS subscriptions_user_active_idx
  ON pool6.subscriptions (user_id, category)
  WHERE payment_status = 'active';

CREATE INDEX IF NOT EXISTS messages_inbox_unread_idx
  ON pool6.messages (receiver_id)
  WHERE read_at IS NULL AND deleted_for_receiver = false AND deleted_for_everyone = false;

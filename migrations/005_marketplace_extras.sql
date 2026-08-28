ALTER TABLE pool6.users ADD COLUMN IF NOT EXISTS avg_reply_secs INTEGER;
ALTER TABLE pool6.users ADD COLUMN IF NOT EXISTS reply_count INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS pool6.saved_searches (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES pool6.users(id) ON DELETE CASCADE,
  query TEXT NOT NULL DEFAULT '',
  category TEXT,
  city TEXT,
  max_price NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS saved_searches_user_id_idx ON pool6.saved_searches (user_id);

CREATE TABLE IF NOT EXISTS pool6.chat_prefs (
  user_id INTEGER NOT NULL REFERENCES pool6.users(id) ON DELETE CASCADE,
  other_user_id INTEGER NOT NULL REFERENCES pool6.users(id) ON DELETE CASCADE,
  pinned BOOLEAN NOT NULL DEFAULT false,
  muted BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, other_user_id)
);

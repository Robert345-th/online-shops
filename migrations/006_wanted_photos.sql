ALTER TABLE pool6.wanted_posts ADD COLUMN IF NOT EXISTS photos TEXT[] DEFAULT '{}';

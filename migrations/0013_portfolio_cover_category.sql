ALTER TABLE portfolio_items ADD COLUMN is_cover INTEGER NOT NULL DEFAULT 0 CHECK (is_cover IN (0, 1));
ALTER TABLE portfolio_items ADD COLUMN category TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('wedding', 'events', 'portrait', 'family', 'corporate', 'product', 'fashion', 'newborn', 'nature', 'real-estate', 'other'));
CREATE UNIQUE INDEX IF NOT EXISTS idx_portfolio_items_one_cover_per_user ON portfolio_items(user_id) WHERE is_cover = 1;
CREATE INDEX IF NOT EXISTS idx_portfolio_items_user_cover ON portfolio_items(user_id, is_cover, position, id);

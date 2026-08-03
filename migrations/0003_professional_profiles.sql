CREATE TABLE IF NOT EXISTS professional_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL COLLATE NOCASE UNIQUE,
  bio TEXT NOT NULL DEFAULT '',
  specialties TEXT NOT NULL DEFAULT '[]',
  city TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT '',
  service_radius_km INTEGER CHECK (service_radius_km IS NULL OR (service_radius_km BETWEEN 0 AND 1000)),
  starting_price_cents INTEGER CHECK (starting_price_cents IS NULL OR starting_price_cents >= 0),
  availability TEXT NOT NULL DEFAULT 'available' CHECK (availability IN ('available', 'limited', 'unavailable')),
  public_email TEXT NOT NULL DEFAULT '',
  public_phone TEXT NOT NULL DEFAULT '',
  instagram TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  show_email INTEGER NOT NULL DEFAULT 0 CHECK (show_email IN (0, 1)),
  show_phone INTEGER NOT NULL DEFAULT 0 CHECK (show_phone IN (0, 1)),
  is_published INTEGER NOT NULL DEFAULT 0 CHECK (is_published IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_professional_profiles_published_location
  ON professional_profiles(is_published, state, city);

CREATE INDEX IF NOT EXISTS idx_professional_profiles_slug
  ON professional_profiles(slug);

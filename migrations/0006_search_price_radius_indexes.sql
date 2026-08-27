CREATE INDEX IF NOT EXISTS idx_professional_profiles_published_price_updated
  ON professional_profiles(is_published, starting_price_cents, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_professional_profiles_published_radius_updated
  ON professional_profiles(is_published, service_radius_km, updated_at DESC);

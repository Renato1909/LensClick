DROP INDEX IF EXISTS idx_professional_profiles_slug;

CREATE INDEX IF NOT EXISTS idx_professional_profiles_published_updated
  ON professional_profiles(is_published, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_professional_profiles_published_state_updated
  ON professional_profiles(is_published, state, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_professional_profiles_published_availability_updated
  ON professional_profiles(is_published, availability, updated_at DESC);

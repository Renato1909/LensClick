CREATE TABLE IF NOT EXISTS review_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_user_id INTEGER NOT NULL,
  photographer_user_id INTEGER NOT NULL,
  message TEXT NOT NULL CHECK (length(message) BETWEEN 10 AND 1000),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),
  confirmed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (client_user_id <> photographer_user_id),
  FOREIGN KEY (client_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (photographer_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_review_requests_one_pending
  ON review_requests(client_user_id, photographer_user_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_review_requests_photographer_status_created
  ON review_requests(photographer_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_review_requests_client_created
  ON review_requests(client_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL UNIQUE,
  client_user_id INTEGER NOT NULL,
  photographer_user_id INTEGER NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL CHECK (length(comment) BETWEEN 10 AND 1000),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted', 'moderated')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  CHECK (client_user_id <> photographer_user_id),
  FOREIGN KEY (request_id) REFERENCES review_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (client_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (photographer_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_reviews_photographer_status_created
  ON reviews(photographer_user_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS review_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  review_id INTEGER NOT NULL,
  actor_user_id INTEGER,
  action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'deleted', 'moderated', 'restored')),
  rating INTEGER CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  comment TEXT,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_review_audit_review_created
  ON review_audit(review_id, created_at DESC);

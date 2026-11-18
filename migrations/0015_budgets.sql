CREATE TABLE IF NOT EXISTS budget_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_user_id INTEGER NOT NULL,
  photographer_user_id INTEGER NOT NULL,
  event_type TEXT NOT NULL CHECK (length(event_type) BETWEEN 2 AND 80),
  event_date TEXT NOT NULL,
  place TEXT NOT NULL CHECK (length(place) BETWEEN 2 AND 160),
  duration TEXT CHECK (duration IS NULL OR length(duration) <= 80),
  description TEXT NOT NULL CHECK (length(description) BETWEEN 10 AND 1000),
  additional_info TEXT CHECK (additional_info IS NULL OR length(additional_info) <= 1000),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'proposed', 'accepted', 'rejected', 'cancelled')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (client_user_id <> photographer_user_id),
  FOREIGN KEY (client_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (photographer_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_budget_requests_one_active
  ON budget_requests(client_user_id, photographer_user_id)
  WHERE status IN ('pending', 'proposed');

CREATE INDEX IF NOT EXISTS idx_budget_requests_photographer_status_created
  ON budget_requests(photographer_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_budget_requests_client_created
  ON budget_requests(client_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS proposals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL,
  photographer_user_id INTEGER NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents BETWEEN 0 AND 100000000),
  conditions TEXT CHECK (conditions IS NULL OR length(conditions) <= 1000),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'withdrawn')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES budget_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (photographer_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_proposals_one_pending
  ON proposals(request_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_proposals_request_created
  ON proposals(request_id, created_at DESC);

CREATE TABLE IF NOT EXISTS favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_user_id INTEGER NOT NULL,
  photographer_user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (client_user_id <> photographer_user_id),
  UNIQUE (client_user_id, photographer_user_id),
  FOREIGN KEY (client_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (photographer_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_favorites_client_created
  ON favorites(client_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS budget_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL,
  actor_user_id INTEGER,
  action TEXT NOT NULL CHECK (action IN ('created', 'proposed', 'accepted', 'rejected', 'cancelled', 'withdrawn')),
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES budget_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_budget_audit_request_created
  ON budget_audit(request_id, created_at DESC);
CREATE TABLE engagements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  photographer_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  proposal_id INTEGER UNIQUE REFERENCES proposals(id) ON DELETE SET NULL,
  client_reference TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  service_category TEXT NOT NULL,
  service_description TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_date TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  venue TEXT NOT NULL,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  venue_details TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  fee_cents INTEGER NOT NULL DEFAULT 0 CHECK (fee_cents >= 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash','pix','credit_card','debit_card')),
  payment_status TEXT NOT NULL CHECK (payment_status IN ('awaiting_cash','cash_received','gateway_required')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','delivered','completed','cancelled')),
  updated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (client_user_id, client_reference),
  CHECK (client_user_id <> photographer_user_id),
  CHECK (starts_at < ends_at),
  CHECK (
    (payment_method = 'cash' AND payment_status IN ('awaiting_cash','cash_received'))
    OR (payment_method <> 'cash' AND payment_status = 'gateway_required')
  )
);

CREATE UNIQUE INDEX idx_engagements_active_slot
  ON engagements(client_user_id, photographer_user_id, event_date, starts_at, ends_at)
  WHERE status IN ('pending','accepted','delivered','completed');
CREATE INDEX idx_engagements_client ON engagements(client_user_id, id DESC);
CREATE INDEX idx_engagements_photographer ON engagements(photographer_user_id, id DESC);

CREATE TABLE engagement_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  engagement_id INTEGER NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL,
  payment_status TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_engagement_events ON engagement_events(engagement_id, id);

CREATE TRIGGER engagement_initial_event AFTER INSERT ON engagements
BEGIN
  INSERT INTO engagement_events (engagement_id, actor_user_id, status, payment_status)
  VALUES (NEW.id, NEW.client_user_id, NEW.status, NEW.payment_status);
END;

CREATE TRIGGER engagement_change_event AFTER UPDATE OF status, payment_status ON engagements
WHEN OLD.status <> NEW.status OR OLD.payment_status <> NEW.payment_status
BEGIN
  INSERT INTO engagement_events (engagement_id, actor_user_id, status, payment_status)
  VALUES (NEW.id, NEW.updated_by_user_id, NEW.status, NEW.payment_status);
END;

ALTER TABLE review_requests ADD COLUMN engagement_id INTEGER REFERENCES engagements(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX idx_review_requests_engagement ON review_requests(engagement_id);

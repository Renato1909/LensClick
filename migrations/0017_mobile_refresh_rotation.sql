-- ADR 001, riscos #4-#7: refresh rotativo de sessoes moveis com replay detection,
-- device name/app version persistidos e auditoria de autenticacao movel.
-- O token antigo NUNCA e apagado na rotacao: fica marcado como rotacionado para
-- detectar reuso (replay). Registros expirados continuam sendo varridos.

ALTER TABLE sessions
  ADD COLUMN device_name TEXT;

ALTER TABLE sessions
  ADD COLUMN app_version TEXT;

ALTER TABLE sessions
  ADD COLUMN rotated_at INTEGER;

ALTER TABLE sessions
  ADD COLUMN replaced_by_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_sessions_user_kind_rotated
  ON sessions(user_id, kind, rotated_at);

CREATE TABLE IF NOT EXISTS mobile_auth_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  event TEXT NOT NULL CHECK (event IN ('login', 'register', 'refresh', 'replay_reuse', 'logout')),
  device_name TEXT,
  app_version TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_mobile_auth_audit_user_created
  ON mobile_auth_audit(user_id, created_at DESC);

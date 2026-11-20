-- ADR 002 — 2FA multicliente (TOTP + códigos de recuperação).
-- Estado do desafio e do enrollment vive no D1 (durável), nunca em memória.
-- O segredo TOTP precisa ser legível para calcular códigos; nunca é logado nem
-- devolvido depois da confirmação. Códigos de recuperação são somente hash.
ALTER TABLE users
  ADD COLUMN two_factor_secret TEXT;

ALTER TABLE users
  ADD COLUMN two_factor_enabled_at INTEGER;

CREATE TABLE IF NOT EXISTS two_factor_challenges (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('login', 'enrollment')),
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_two_factor_challenges_user_kind
  ON two_factor_challenges(user_id, kind, expires_at);

CREATE TABLE IF NOT EXISTS two_factor_recovery_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_two_factor_recovery_codes_user
  ON two_factor_recovery_codes(user_id);

CREATE TABLE IF NOT EXISTS two_factor_trusted_devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_hash TEXT NOT NULL,
  name TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_two_factor_trusted_devices_user
  ON two_factor_trusted_devices(user_id, expires_at);

CREATE TABLE IF NOT EXISTS two_factor_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  event TEXT NOT NULL CHECK (event IN (
    'enrollment_started', 'enabled', 'disabled', 'challenge_issued',
    'challenge_expired', 'verify_success', 'verify_failed',
    'recovery_code_used', 'trusted_device_revoked'
  )),
  at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_two_factor_audit_user_at
  ON two_factor_audit(user_id, at DESC);

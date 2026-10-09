-- ADR 001, Crítico 2: separar sessões web e móveis com caps independentes.
-- Todas as sessões existentes (web + móveis misturadas) passam a ser 'web',
-- o que é seguro porque a poda móvel nova só atua sobre kind='mobile'.

ALTER TABLE sessions
  ADD COLUMN kind TEXT NOT NULL DEFAULT 'web'
  CHECK (kind IN ('web', 'mobile'));

CREATE INDEX IF NOT EXISTS idx_sessions_user_kind_expires
  ON sessions(user_id, kind, expires_at DESC);

DROP INDEX IF EXISTS idx_sessions_user_id;

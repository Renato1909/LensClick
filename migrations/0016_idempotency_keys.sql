-- Idempotency-Key para mutações do contrato de orçamentos/propostas/favoritos.
-- Guarda a resposta final (status + corpo) por (key, user_id, route) para
-- replay seguro de retries de rede do app Android. Entradas com mais de
-- 7 dias são removidas oportunisticamente nas inserções.
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  route TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status INTEGER NOT NULL,
  response_body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (key, user_id, route),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_created
  ON idempotency_keys(created_at);

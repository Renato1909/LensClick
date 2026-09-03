-- Fase 4.4: histograma de latencia e contadores de erro por minuto.
-- Alimenta os alertas in-worker de P95 e taxa de 5xx (src/monitoring.mjs).
-- Nao contem nenhum dado de usuario: apenas contadores agregados por minuto.
CREATE TABLE IF NOT EXISTS monitor_minute_buckets (
  bucket_minute TEXT PRIMARY KEY, -- ISO-8601 truncado ao minuto, ex: '2026-09-03T14:35'
  total INTEGER NOT NULL DEFAULT 0,
  errors_5xx INTEGER NOT NULL DEFAULT 0,
  api_total INTEGER NOT NULL DEFAULT 0,
  api_lt50 INTEGER NOT NULL DEFAULT 0,
  api_lt100 INTEGER NOT NULL DEFAULT 0,
  api_lt300 INTEGER NOT NULL DEFAULT 0,
  api_lt500 INTEGER NOT NULL DEFAULT 0,
  api_lt1000 INTEGER NOT NULL DEFAULT 0,
  api_gte1000 INTEGER NOT NULL DEFAULT 0
);

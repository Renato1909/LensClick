import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createWorkerFixture } from '../test-support/worker-fixture.mjs';

const read = (file) => readFileSync(resolve(file), 'utf8');

function migratedDatabase() {
  const database = new DatabaseSync(':memory:');
  for (const migration of [
    'migrations/0001_initial.sql',
    'migrations/0002_password_reset.sql',
    'migrations/0003_professional_profiles.sql',
    'migrations/0004_portfolio_items.sql',
    'migrations/0005_search_indexes.sql',
    'migrations/0006_search_price_radius_indexes.sql',
    'migrations/0007_reviews_and_reputation.sql'
  ]) {
    database.exec(read(migration));
  }
  return database;
}

function queryPlan(database, sql, values) {
  return database.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...values).map(({ detail }) => detail).join('\n');
}

test('migrations de busca alinham os indices aos filtros e a ordenacao', () => {
  const database = migratedDatabase();
  assert.match(read('db/schema.ts'), /schemaVersion = 7/);
  const base = `
    SELECT p.user_id
    FROM professional_profiles p
    JOIN users u ON u.id = p.user_id
    WHERE p.is_published = 1 AND u.role = ?`;

  const plans = {
    default: queryPlan(database, `${base} ORDER BY p.updated_at DESC LIMIT 12`, ['photographer']),
    state: queryPlan(database, `${base} AND p.state = ? ORDER BY p.updated_at DESC LIMIT 12`, ['photographer', 'SP']),
    availability: queryPlan(database, `${base} AND p.availability = ? ORDER BY p.updated_at DESC LIMIT 12`, ['photographer', 'available']),
    price: queryPlan(database, `${base} AND p.starting_price_cents >= ? ORDER BY p.starting_price_cents ASC LIMIT 12`, ['photographer', 250000]),
    radius: queryPlan(database, `${base} AND p.service_radius_km >= ? ORDER BY p.service_radius_km DESC LIMIT 12`, ['photographer', 50])
  };

  assert.match(plans.default, /idx_professional_profiles_published_updated/);
  assert.match(plans.state, /idx_professional_profiles_published_state_updated/);
  assert.match(plans.availability, /idx_professional_profiles_published_availability_updated/);
  assert.match(plans.price, /idx_professional_profiles_published_price_updated/);
  assert.match(plans.radius, /idx_professional_profiles_published_radius_updated/);
  for (const plan of Object.values(plans)) assert.doesNotMatch(plan, /TEMP B-TREE FOR ORDER BY/);

  const indexes = database.prepare("SELECT name, origin FROM pragma_index_list('professional_profiles')").all();
  assert.equal(indexes.some(({ name }) => name === 'idx_professional_profiles_slug'), false);
  assert.equal(indexes.some(({ origin }) => origin === 'u'), true);
  assert.match(
    queryPlan(database, 'SELECT user_id FROM professional_profiles WHERE slug = ?', ['fotografa-exemplo']),
    /sqlite_autoindex_professional_profiles_1/
  );
  database.close();
});

test('GET /api/health confirma Worker e D1 sem expor detalhes internos', async (t) => {
  const fixture = createWorkerFixture();
  t.after(() => fixture.close());

  const result = await fixture.request('/api/health', { useCookie: false });

  assert.equal(result.response.status, 200);
  assert.deepEqual(result.json, { status: 'ok', checks: { database: 'ok' } });
  assert.equal(result.response.headers.get('cache-control'), 'no-store');
  assert.match(result.response.headers.get('x-request-id') || '', /^[0-9a-f-]{36}$/i);
  const completed = fixture.observabilityEvents.at(-1)?.event;
  assert.equal(completed?.event, 'http.request.completed');
  assert.equal(completed?.method, 'GET');
  assert.equal(completed?.route, '/api/health');
  assert.equal(completed?.status, 200);
  assert.equal(completed?.outcome, 'success');
});

test('GET /api/health retorna 503 generico quando o D1 falha', async (t) => {
  const DB = {
    prepare() {
      return { first() { throw new Error('D1_INTERNAL_SECRET_CANARY'); } };
    },
    close() {}
  };
  const fixture = createWorkerFixture({ env: { DB } });
  t.after(() => fixture.close());

  const result = await fixture.request('/api/health', { useCookie: false });

  assert.equal(result.response.status, 503);
  assert.deepEqual(result.json, { status: 'unavailable' });
  assert.doesNotMatch(JSON.stringify(result.json), /D1_INTERNAL_SECRET_CANARY/);
  const databaseFailure = fixture.observabilityEvents.find(({ event }) => event.event === 'database.health_check.failed')?.event;
  assert.equal(databaseFailure?.schema_version, 1);
  assert.equal(databaseFailure?.level, 'error');
  assert.equal(databaseFailure?.error_category, 'database_error');
  assert.match(databaseFailure?.request_id || '', /^[0-9a-f-]{36}$/i);
  assert.doesNotMatch(JSON.stringify(fixture.observabilityEvents), /D1_INTERNAL_SECRET_CANARY/);
  assert.equal(fixture.observabilityEvents.at(-1)?.event.route, '/api/health');
  assert.equal(fixture.observabilityEvents.at(-1)?.event.outcome, 'server_error');
});

test('metodos nao suportados em /api/health preservam o contrato 404', async (t) => {
  const fixture = createWorkerFixture();
  t.after(() => fixture.close());

  const result = await fixture.request('/api/health', { method: 'POST', useCookie: false });

  assert.equal(result.response.status, 404);
  assert.deepEqual(result.json, { error: 'Endpoint nao encontrado.' });
});

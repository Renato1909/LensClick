import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.mjs';
import { MockD1, MockR2, createExecutionContext } from '../test-support/worker-fixture.mjs';

class MockCache {
  constructor() {
    this.entries = new Map();
    this.puts = 0;
    this.matches = 0;
  }

  async match(request) {
    this.matches += 1;
    const response = this.entries.get(new URL(request.url).toString());
    return response?.clone() || undefined;
  }

  async put(request, response) {
    this.puts += 1;
    this.entries.set(new URL(request.url).toString(), response.clone());
  }
}

test('cache de edge reutiliza buscas publicas sem armazenar respostas privadas', async (t) => {
  const previousCaches = globalThis.caches;
  const cache = new MockCache();
  globalThis.caches = { default: cache };
  t.after(() => {
    globalThis.caches = previousCaches;
  });

  const DB = new MockD1();
  const PROFILE_IMAGES = new MockR2();
  const env = { DB, PROFILE_IMAGES };
  const origin = 'https://lensclick.test';
  const user = DB.prepare(`
    INSERT INTO users (name, email, phone, password_hash, role, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'photographer', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).bind('Cache Teste', 'cache@test.com', '(00)00000-0000', 'pbkdf2-sha256$100000$dummy$hash').run();
  DB.prepare(`
    INSERT INTO professional_profiles
      (user_id, slug, bio, specialties, city, state, availability, is_published)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `).bind(user.meta.last_row_id, `cache-teste-${user.meta.last_row_id}`, 'Perfil público', '["portrait"]', 'São Paulo', 'SP', 'available').run();

  const firstContext = createExecutionContext();
  const first = await worker.fetch(new Request(`${origin}/api/photographers?city=São%20Paulo`, {
    headers: { Origin: origin }
  }), env, firstContext);
  await firstContext.settle();
  assert.equal(first.status, 200);
  assert.equal(cache.puts, 1);

  DB.database.exec('DELETE FROM professional_profiles; DELETE FROM users;');
  const second = await worker.fetch(new Request(`${origin}/api/photographers?city=São%20Paulo`, {
    headers: { Origin: origin }
  }), env, createExecutionContext());
  const payload = await second.json();
  assert.equal(second.status, 200);
  assert.equal(payload.photographers.length, 1);
  assert.equal(payload.photographers[0].name, 'Cache Teste');
  assert.equal(cache.matches, 2);
  DB.close();
});

test('HEAD não grava resposta sem corpo e perfis privados nunca são elegíveis', async () => {
  const previousCaches = globalThis.caches;
  const cache = new MockCache();
  globalThis.caches = { default: cache };
  try {
    const DB = new MockD1();
    const PROFILE_IMAGES = new MockR2();
    const env = { DB, PROFILE_IMAGES };
    const origin = 'https://lensclick.test';
    const head = await worker.fetch(new Request(`${origin}/api/photographers`, { method: 'HEAD' }), env, createExecutionContext());
    assert.equal(head.status, 404);
    assert.equal(cache.puts, 0);
    DB.close();
  } finally {
    globalThis.caches = previousCaches;
  }
});

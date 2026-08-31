import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.mjs';
import { MockD1, MockR2 } from '../test-support/worker-fixture.mjs';

test('API de busca de fotógrafos funciona com filtros e paginação', async (t) => {
  const DB = new MockD1();
  const PROFILE_IMAGES = new MockR2();
  const env = { DB, PROFILE_IMAGES };
  const origin = 'https://lensclick.test';
  t.after(() => DB.close());

  async function request(path) {
    const response = await worker.fetch(new Request(origin + path, { headers: { Origin: origin } }), env);
    const contentType = response.headers.get('content-type') || '';
    return { response, json: contentType.includes('json') ? await response.json() : null };
  }

  // Inserir usuários e perfis
  const photographers = [
    { name: 'Ana Silva', email: 'ana@test.com', city: 'São Paulo', state: 'SP', specialties: JSON.stringify(['wedding','portrait']), availability: 'available', bio: 'Ana bio', starting_price_cents: 300000, service_radius_km: 50, is_published: 1 },
    { name: 'Bruno Costa', email: 'bruno@test.com', city: 'Campinas', state: 'SP', specialties: JSON.stringify(['events','corporate']), availability: 'limited', bio: 'Bruno bio', starting_price_cents: 250000, service_radius_km: 100, is_published: 1 },
    { name: 'Carla Dias', email: 'carla@test.com', city: 'Rio de Janeiro', state: 'RJ', specialties: JSON.stringify(['fashion','product']), availability: 'unavailable', bio: 'Carla bio', starting_price_cents: 500000, service_radius_km: 30, is_published: 1 }
  ];

  // inserir usuários
  for (const p of photographers) {
    const userInsert = DB.prepare(`INSERT INTO users (name, email, phone, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, 'photographer', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`)
      .bind(p.name, p.email, '(00)00000-0000', 'pbkdf2-sha256$100000$dummy$hash');
    const res = userInsert.run();
    const userId = res.meta.last_row_id;
    const slug = `${p.name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}-${userId}`;
    DB.prepare(`INSERT INTO professional_profiles (user_id, slug, bio, specialties, city, state, service_radius_km, starting_price_cents, availability, is_published) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(userId, slug, p.bio, p.specialties, p.city, p.state, p.service_radius_km, p.starting_price_cents, p.availability, p.is_published).run();
  }

  // cliente (não-fotógrafo)
  const clientResult = DB.prepare(`INSERT INTO users (name, email, phone, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, 'client', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`).bind('Cliente Teste', 'cliente@test.com', '(00)00000-1111', 'pbkdf2-sha256$100000$dummy$hash').run();
  const carlaId = DB.prepare('SELECT id FROM users WHERE email = ?').bind('carla@test.com').first('id');
  const reviewRequest = DB.prepare(`INSERT INTO review_requests (client_user_id, photographer_user_id, message, status, confirmed_at) VALUES (?, ?, ?, 'confirmed', CURRENT_TIMESTAMP)`)
    .bind(clientResult.meta.last_row_id, carlaId, 'Contato confirmado para ordenar a reputacao na busca.').run();
  DB.prepare(`INSERT INTO reviews (request_id, client_user_id, photographer_user_id, rating, comment) VALUES (?, ?, ?, 5, ?)`)
    .bind(reviewRequest.meta.last_row_id, clientResult.meta.last_row_id, carlaId, 'Experiencia excelente para validar a ordenacao por avaliacao.').run();

  // Testes básicos
  const list = await request('/api/photographers');
  assert.equal(list.response.status, 200);
  assert.ok(Array.isArray(list.json.photographers));
  assert.ok(list.json.pagination.total >= 3);

  const sp = await request('/api/photographers?state=SP');
  assert.equal(sp.response.status, 200);
  assert.ok(sp.json.photographers.every(p => p.state === 'SP'));

  const city = await request('/api/photographers?city=São');
  assert.equal(city.response.status, 200);
  assert.ok(city.json.photographers.length >= 1);

  const specialty = await request('/api/photographers?specialty=wedding');
  assert.equal(specialty.response.status, 200);
  assert.ok(specialty.json.photographers.every(p => p.specialties.includes('wedding')));

  const avail = await request('/api/photographers?availability=available');
  assert.equal(avail.response.status, 200);
  assert.ok(avail.json.photographers.every(p => p.availability === 'available'));

  const priceRange = await request('/api/photographers?minPrice=2600&maxPrice=3500');
  assert.equal(priceRange.response.status, 200);
  assert.deepEqual(priceRange.json.photographers.map(p => p.name), ['Ana Silva']);

  const serviceRadius = await request('/api/photographers?minRadius=75');
  assert.equal(serviceRadius.response.status, 200);
  assert.deepEqual(serviceRadius.json.photographers.map(p => p.name), ['Bruno Costa']);

  const priceAscending = await request('/api/photographers?sort=price_asc');
  assert.equal(priceAscending.response.status, 200);
  assert.equal(priceAscending.json.sort, 'price_asc');
  assert.deepEqual(priceAscending.json.photographers.map(p => p.name), ['Bruno Costa', 'Ana Silva', 'Carla Dias']);

  const priceDescending = await request('/api/photographers?sort=price_desc');
  assert.deepEqual(priceDescending.json.photographers.map(p => p.name), ['Carla Dias', 'Ana Silva', 'Bruno Costa']);

  const radiusDescending = await request('/api/photographers?sort=radius_desc');
  assert.deepEqual(radiusDescending.json.photographers.map(p => p.name), ['Bruno Costa', 'Ana Silva', 'Carla Dias']);

  const ratingDescending = await request('/api/photographers?sort=rating_desc');
  assert.equal(ratingDescending.json.photographers[0].name, 'Carla Dias');
  assert.equal(ratingDescending.json.photographers[0].ratingAverage, 5);
  assert.equal(ratingDescending.json.photographers[0].reviewCount, 1);

  const invalidAdvancedFilters = await request('/api/photographers?minPrice=invalid&maxPrice=-1&minRadius=1001&sort=DROP%20TABLE');
  assert.equal(invalidAdvancedFilters.response.status, 200);
  assert.equal(invalidAdvancedFilters.json.pagination.total, 3);
  assert.equal(invalidAdvancedFilters.json.sort, 'recommended');

  const page1 = await request('/api/photographers?page=1&pageSize=2');
  assert.equal(page1.response.status, 200);
  assert.equal(page1.json.pagination.page, 1);
  assert.equal(page1.json.pagination.pageSize, 2);

  const large = await request('/api/photographers?pageSize=100');
  assert.equal(large.response.status, 200);
  assert.equal(large.json.pagination.pageSize, 50);

  const none = await request('/api/photographers?state=AC');
  assert.equal(none.response.status, 200);
  assert.equal(none.json.photographers.length, 0);

  const cacheCheck = await request('/api/photographers');
  const cacheControl = cacheCheck.response.headers.get('Cache-Control');
  assert.ok(cacheControl && cacheControl.includes('public'));
});

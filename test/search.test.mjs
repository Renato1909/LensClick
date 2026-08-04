import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/worker.mjs';

class MockD1Statement {
  constructor(database, sql) {
    this.statement = database.prepare(sql);
    this.values = [];
  }

  bind(...values) {
    this.values = values;
    return this;
  }

  first(column) {
    const row = this.statement.get(...this.values) ?? null;
    return column && row ? row[column] : row;
  }

  run() {
    const result = this.statement.run(...this.values);
    return { success: true, meta: { changes: result.changes, last_row_id: Number(result.lastInsertRowid) } };
  }

  all() {
    return { success: true, results: this.statement.all(...this.values) };
  }
}

class MockD1 {
  constructor() {
    this.database = new DatabaseSync(':memory:');
    this.database.exec(readFileSync(resolve('migrations/0001_initial.sql'), 'utf8'));
    this.database.exec(readFileSync(resolve('migrations/0002_password_reset.sql'), 'utf8'));
    this.database.exec(readFileSync(resolve('migrations/0003_professional_profiles.sql'), 'utf8'));
    this.database.exec(readFileSync(resolve('migrations/0004_portfolio_items.sql'), 'utf8'));
  }

  prepare(sql) {
    return new MockD1Statement(this.database, sql);
  }

  batch(statements) {
    this.database.exec('BEGIN');
    try {
      const results = statements.map((statement) => statement.run());
      this.database.exec('COMMIT');
      return results;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  close() {
    this.database.close();
  }
}

class MockR2 {
  constructor() {
    this.objects = new Map();
  }

  async put(key, value, options = {}) {
    this.objects.set(key, { body: new Uint8Array(value), httpMetadata: options.httpMetadata || {} });
  }

  async get(key) {
    const object = this.objects.get(key);
    if (!object) return null;
    return {
      ...object,
      writeHttpMetadata(headers) {
        if (object.httpMetadata.contentType) headers.set('Content-Type', object.httpMetadata.contentType);
      }
    };
  }

  async delete(key) {
    for (const item of Array.isArray(key) ? key : [key]) this.objects.delete(item);
  }
}

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
  DB.prepare(`INSERT INTO users (name, email, phone, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, 'client', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`).bind('Cliente Teste', 'cliente@test.com', '(00)00000-1111', 'pbkdf2-sha256$100000$dummy$hash').run();

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
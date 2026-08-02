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
  }

  prepare(sql) {
    return new MockD1Statement(this.database, sql);
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
    this.objects.delete(key);
  }
}

test('Worker usa D1 e R2 no fluxo completo de autenticacao', async (t) => {
  const DB = new MockD1();
  const PROFILE_IMAGES = new MockR2();
  const env = { DB, PROFILE_IMAGES };
  const origin = 'https://lensclick.test';
  let cookie = '';
  t.after(() => DB.close());

  async function request(path, { method = 'GET', body, withCookie = true } = {}) {
    const response = await worker.fetch(new Request(origin + path, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json', Origin: origin } : {}),
        ...(withCookie && cookie ? { Cookie: cookie } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    }), env);
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const contentType = response.headers.get('content-type') || '';
    return { response, json: contentType.includes('json') ? await response.json() : null };
  }

  const registration = await request('/api/auth/register', {
    method: 'POST',
    body: { name: 'Pessoa Teste', email: 'PESSOA@example.com', phone: '(11) 99999-9999', password: 'Segura123' }
  });
  assert.equal(registration.response.status, 201);
  assert.equal(registration.json.user.email, 'pessoa@example.com');
  assert.match(cookie, /^lensclick_session=/);
  assert.match(registration.response.headers.get('set-cookie'), /HttpOnly; SameSite=Lax/);
  assert.match(registration.response.headers.get('set-cookie'), /Secure/);

  const storedUser = DB.prepare('SELECT * FROM users WHERE email = ?').bind('pessoa@example.com').first();
  assert.match(storedUser.password_hash, /^pbkdf2-sha256\$100000\$/);
  assert.doesNotMatch(storedUser.password_hash, /Segura123/);

  const me = await request('/api/auth/me');
  assert.equal(me.response.status, 200);
  assert.equal(me.json.user.name, 'Pessoa Teste');
  assert.equal('password_hash' in me.json.user, false);

  const onePixelPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const profile = await request('/api/profile', {
    method: 'PUT',
    body: { ...me.json.user, email: 'novo@example.com', age: 22, gender: 'other', role: 'client', profilePic: onePixelPng }
  });
  assert.equal(profile.response.status, 200);
  assert.match(profile.json.user.profilePic, /^\/api\/profile-picture\/\d+/);
  assert.equal(PROFILE_IMAGES.objects.size, 1);

  const picture = await request(profile.json.user.profilePic);
  assert.equal(picture.response.status, 200);
  assert.equal(picture.response.headers.get('content-type'), 'image/png');

  const contact = await request('/api/contact', {
    method: 'POST',
    body: { name: 'Pessoa Teste', email: 'novo@example.com', message: 'Gostaria de solicitar um orcamento.' }
  });
  assert.equal(contact.response.status, 201);

  const newsletter = await request('/api/newsletter', {
    method: 'POST',
    body: { email: 'novo@example.com' }
  });
  assert.equal(newsletter.response.status, 201);

  const logout = await request('/api/auth/logout', { method: 'POST', body: {} });
  assert.equal(logout.response.status, 200);
  const unauthorized = await request('/api/auth/me');
  assert.equal(unauthorized.response.status, 401);

  const login = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'novo@example.com', password: 'Segura123' },
    withCookie: false
  });
  assert.equal(login.response.status, 200);
});

test('Worker rejeita mutacoes de outra origem e senhas invalidas', async (t) => {
  const DB = new MockD1();
  t.after(() => DB.close());
  const env = { DB, PROFILE_IMAGES: new MockR2() };
  const payload = JSON.stringify({ name: 'Pessoa Teste', email: 'pessoa@example.com', phone: '11999999999', password: 'fraca' });

  const foreignOrigin = await worker.fetch(new Request('https://lensclick.test/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://site-malicioso.test' },
    body: payload
  }), env);
  assert.equal(foreignOrigin.status, 403);

  const weakPassword = await worker.fetch(new Request('https://lensclick.test/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://lensclick.test' },
    body: payload
  }), env);
  assert.equal(weakPassword.status, 400);
});

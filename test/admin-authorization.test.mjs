import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWorkerFixture } from '../test-support/worker-fixture.mjs';

const ADMIN = Object.freeze({
  name: 'Admin Moderacao',
  email: 'admin@example.com',
  phone: '(11) 99999-9999',
  password: 'Segura123'
});

const CLIENT = Object.freeze({
  name: 'Cliente Comum',
  email: 'cliente@example.com',
  phone: '(11) 98888-8888',
  password: 'Segura123'
});

async function fixtureFor(t, options) {
  const fixture = createWorkerFixture(options);
  t.after(() => fixture.close());
  return fixture;
}

async function registerAndLogin(fixture, registration) {
  await fixture.request('/api/auth/register', {
    method: 'POST', json: registration, useCookie: false
  });
  fixture.cookie = '';
  const login = await fixture.request('/api/auth/login', {
    method: 'POST',
    json: { email: registration.email, password: registration.password }
  });
  assert.equal(login.response.status, 200);
  return login;
}

function promoteToAdmin(fixture, email) {
  return fixture.DB.prepare('UPDATE users SET is_admin = 1 WHERE email = ?').bind(email).run();
}

test('GET /api/admin/overview exige sessao e papel de administrador', async (t) => {
  const fixture = await fixtureFor(t);

  const anonymous = await fixture.request('/api/admin/overview', { useCookie: false });
  assert.equal(anonymous.response.status, 401);

  await registerAndLogin(fixture, CLIENT);
  const me = await fixture.request('/api/auth/me', {});
  assert.equal(me.response.status, 200);
  assert.equal(me.json.user.isAdmin, false);

  const forbidden = await fixture.request('/api/admin/overview', {});
  assert.equal(forbidden.response.status, 403);
});

test('administrador promovido por SQL acessa o overview com contagens', async (t) => {
  const fixture = await fixtureFor(t);
  await registerAndLogin(fixture, ADMIN);
  promoteToAdmin(fixture, ADMIN.email);

  const me = await fixture.request('/api/auth/me', {});
  assert.equal(me.json.user.isAdmin, true);

  const overview = await fixture.request('/api/admin/overview', {});
  assert.equal(overview.response.status, 200);
  assert.deepEqual(overview.json.overview, {
    users: 1,
    unverifiedUsers: 1,
    publishedPhotographers: 0,
    pendingReviewRequests: 0,
    activeConversations: 0
  });
});

test('promocao e isolada por usuario e o cadastro nunca cria admin', async (t) => {
  const fixture = await fixtureFor(t);
  await registerAndLogin(fixture, ADMIN);
  promoteToAdmin(fixture, ADMIN.email);

  fixture.cookie = '';
  await registerAndLogin(fixture, CLIENT);
  const forbidden = await fixture.request('/api/admin/overview', {});
  assert.equal(forbidden.response.status, 403);

  const row = fixture.DB.prepare('SELECT is_admin FROM users WHERE email = ?').bind(CLIENT.email).first();
  assert.equal(Number(row.is_admin), 0);
});

test('papel administrativo possui migracao, guard e nenhuma rota de promocao', () => {
  const migration = readFileSync('migrations/0012_admin_role.sql', 'utf8');
  const worker = readFileSync('src/worker.mjs', 'utf8');
  const auth = readFileSync('src/auth.mjs', 'utf8');
  const admin = readFileSync('src/admin.mjs', 'utf8');

  assert.match(migration, /ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0 CHECK \(is_admin IN \(0, 1\)\)/);
  assert.match(worker, /routeId\.startsWith\('admin\.'\)/);
  assert.match(worker, /requireAdmin/);
  assert.match(admin, /SELECT is_admin FROM users WHERE id = \?/);
  assert.doesNotMatch(auth, /is_admin/);
  assert.doesNotMatch(worker, /SET is_admin = 1/);
});

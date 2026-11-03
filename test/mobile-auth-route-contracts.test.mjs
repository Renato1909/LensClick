import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkerFixture } from '../test-support/worker-fixture.mjs';

const REGISTRATION = Object.freeze({
  name: 'Pessoa Mobile',
  email: 'mobile@example.com',
  phone: '(11) 98888-7777',
  password: 'Segura123'
});

function assertJsonContract(result, status) {
  assert.equal(result.response.status, status);
  assert.match(result.response.headers.get('content-type') || '', /^application\/json/i);
  assert.equal(result.response.headers.get('cache-control'), 'no-store');
  assert.equal(result.response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(result.response.headers.get('x-request-id') || '', /^[0-9a-f-]{36}$/i);
  assert.ok(result.json && typeof result.json === 'object');
}

async function register(fixture) {
  return fixture.request('/api/auth/register', {
    method: 'POST',
    json: REGISTRATION,
    useCookie: false
  });
}

async function mobileLogin(fixture, overrides = {}) {
  return fixture.request('/api/mobile/auth/login', {
    method: 'POST',
    json: {
      email: REGISTRATION.email,
      password: REGISTRATION.password,
      deviceName: 'Android Test',
      appVersion: '1.0',
      ...overrides
    },
    originHeader: false,
    useCookie: false
  });
}

test('POST /api/mobile/auth/login cria sessao Bearer sem depender de cookie ou Origin', async (t) => {
  const fixture = createWorkerFixture();
  t.after(() => fixture.close());

  await register(fixture);
  const result = await mobileLogin(fixture);

  assertJsonContract(result, 200);
  assert.equal(result.json.user.email, REGISTRATION.email);
  assert.equal('password_hash' in result.json.user, false);
  assert.match(result.json.session.accessToken, /^[A-Za-z0-9_-]{40,200}$/);
  assert.match(result.json.session.expiresAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(result.response.headers.get('set-cookie'), null);

  const stored = fixture.DB.prepare('SELECT token_hash, expires_at FROM sessions WHERE user_id = (SELECT id FROM users WHERE email = ?) ORDER BY created_at DESC LIMIT 1')
    .bind(REGISTRATION.email).first();
  assert.ok(stored);
  assert.notEqual(stored.token_hash, result.json.session.accessToken);
  assert.match(stored.token_hash, /^[0-9a-f]{64}$/);
});

test('POST /api/mobile/auth/login mantém erro genérico para credenciais inválidas', async (t) => {
  const fixture = createWorkerFixture();
  t.after(() => fixture.close());

  await register(fixture);
  const wrongPassword = await mobileLogin(fixture, { password: 'Errada123' });
  const unknownEmail = await mobileLogin(fixture, { email: 'naoexiste@example.com', password: 'Errada123' });

  assertJsonContract(wrongPassword, 401);
  assertJsonContract(unknownEmail, 401);
  assert.deepEqual(wrongPassword.json, unknownEmail.json);
});

test('GET /api/mobile/auth/me aceita somente Bearer valido e nao usa cookie web', async (t) => {
  const fixture = createWorkerFixture();
  t.after(() => fixture.close());

  await register(fixture);
  const login = await mobileLogin(fixture);
  const token = login.json.session.accessToken;

  const authenticated = await fixture.request('/api/mobile/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
    useCookie: false
  });
  assertJsonContract(authenticated, 200);
  assert.equal(authenticated.json.user.email, REGISTRATION.email);

  const missing = await fixture.request('/api/mobile/auth/me', { useCookie: false });
  assertJsonContract(missing, 401);

  const malformed = await fixture.request('/api/mobile/auth/me', {
    headers: { Authorization: 'Bearer token-invalido' },
    useCookie: false
  });
  assertJsonContract(malformed, 401);
});

test('POST /api/mobile/auth/logout revoga somente a sessao Bearer apresentada', async (t) => {
  const fixture = createWorkerFixture();
  t.after(() => fixture.close());

  await register(fixture);
  const login = await mobileLogin(fixture);
  const token = login.json.session.accessToken;

  const logout = await fixture.request('/api/mobile/auth/logout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    originHeader: false,
    useCookie: false
  });
  assertJsonContract(logout, 200);
  assert.deepEqual(logout.json, { ok: true, revoked: true });

  const revoked = await fixture.request('/api/mobile/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
    useCookie: false
  });
  assertJsonContract(revoked, 401);
  assert.equal(fixture.DB.prepare('SELECT COUNT(*) AS total FROM sessions').first('total'), 1);
});

test('rotas de conta aceitam explicitamente o principal móvel sem cookie web', async (t) => {
  const fixture = createWorkerFixture();
  t.after(() => fixture.close());

  await register(fixture);
  const login = await mobileLogin(fixture);
  const token = login.json.session.accessToken;

  const updated = await fixture.request('/api/profile', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    json: {
      name: 'Pessoa Mobile Atualizada',
      email: REGISTRATION.email,
      phone: REGISTRATION.phone,
      role: 'client',
      age: '',
      gender: 'other',
      profilePic: ''
    },
    originHeader: false,
    useCookie: false
  });

  assertJsonContract(updated, 200);
  assert.equal(updated.json.user.name, 'Pessoa Mobile Atualizada');
  assert.equal(fixture.cookie.includes('lensclick_session='), true);

  const session = await fixture.request('/api/mobile/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
    useCookie: false
  });
  assertJsonContract(session, 200);
  assert.equal(session.json.user.name, 'Pessoa Mobile Atualizada');
});

test('exclusão de conta móvel não emite cookie de sessão web', async (t) => {
  const fixture = createWorkerFixture();
  t.after(() => fixture.close());

  await register(fixture);
  const login = await mobileLogin(fixture);
  const token = login.json.session.accessToken;

  const deleted = await fixture.request('/api/account', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
    json: { confirmation: 'EXCLUIR', currentPassword: REGISTRATION.password },
    originHeader: false,
    useCookie: false
  });

  assertJsonContract(deleted, 200);
  assert.equal(deleted.response.headers.get('set-cookie'), null);
  assert.equal(fixture.DB.prepare('SELECT COUNT(*) AS total FROM users WHERE email = ?').bind(REGISTRATION.email).first('total'), 0);
});

test('sessao móvel respeita o limite de três sessões móveis ativas por usuário', async (t) => {
  const fixture = createWorkerFixture();
  t.after(() => fixture.close());

  await register(fixture);
  const tokens = [];
  for (let index = 0; index < 4; index += 1) {
    const login = await mobileLogin(fixture, { deviceName: `Android Test ${index}` });
    assertJsonContract(login, 200);
    tokens.push(login.json.session.accessToken);
  }

  assert.equal(
    fixture.DB.prepare("SELECT COUNT(*) AS total FROM sessions WHERE user_id = (SELECT id FROM users WHERE email = ?) AND kind = 'mobile'").bind(REGISTRATION.email).first('total'),
    3
  );

  let active = 0;
  for (const token of tokens) {
    const result = await fixture.request('/api/mobile/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
      useCookie: false
    });
    if (result.response.status === 200) active += 1;
  }
  assert.equal(active, 3);
});

test('sessões web e móveis têm caps independentes (5 web + 3 móveis)', async (t) => {
  const fixture = createWorkerFixture();
  t.after(() => fixture.close());

  await register(fixture);

  // 6 logins web — cap de 5 web
  for (let index = 0; index < 6; index += 1) {
    const login = await fixture.request('/api/auth/login', {
      method: 'POST',
      json: { email: REGISTRATION.email, password: REGISTRATION.password },
      useCookie: false
    });
    assertJsonContract(login, 200);
  }

  // 4 logins móveis — cap de 3 mobile, não devem derrubar as web
  const mobileTokens = [];
  for (let index = 0; index < 4; index += 1) {
    const login = await mobileLogin(fixture, { deviceName: `Android ${index}` });
    assertJsonContract(login, 200);
    mobileTokens.push(login.json.session.accessToken);
  }

  const userSessions = fixture.DB.prepare("SELECT kind, COUNT(*) AS total FROM sessions WHERE user_id = (SELECT id FROM users WHERE email = ?) GROUP BY kind").bind(REGISTRATION.email).all();
  const totals = Object.fromEntries(userSessions.results.map((row) => [row.kind, row.total]));
  assert.equal(totals.web, 5);
  assert.equal(totals.mobile, 3);

  // Todas as 5 sessões web seguem válidas (últimos 5 logins web)
  const webRowCount = fixture.DB.prepare("SELECT COUNT(*) AS total FROM sessions WHERE kind = 'web'").first('total');
  assert.equal(webRowCount, 5);
});

test('POST /api/mobile/auth/register cria conta e sessao móvel sem cookie web', async (t) => {
  const fixture = createWorkerFixture();
  t.after(() => fixture.close());

  const result = await fixture.request('/api/mobile/auth/register', {
    method: 'POST',
    json: {
      ...REGISTRATION,
      deviceName: 'Android Test',
      appVersion: '1.0'
    },
    originHeader: false,
    useCookie: false
  });

  assertJsonContract(result, 201);
  assert.equal(result.json.user.email, REGISTRATION.email);
  assert.match(result.json.session.accessToken, /^[A-Za-z0-9_-]{40,200}$/);
  assert.match(result.json.session.expiresAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(result.response.headers.get('set-cookie'), null);
  assert.equal(fixture.DB.prepare('SELECT COUNT(*) AS total FROM users').first('total'), 1);
  assert.equal(fixture.DB.prepare('SELECT COUNT(*) AS total FROM sessions WHERE kind = ?').bind('mobile').first('total'), 1);
});

test('POST /api/mobile/auth/register aplica validação e conflito de e-mail', async (t) => {
  const fixture = createWorkerFixture();
  t.after(() => fixture.close());

  const invalid = await fixture.request('/api/mobile/auth/register', {
    method: 'POST',
    json: { ...REGISTRATION, password: 'curta' },
    originHeader: false,
    useCookie: false
  });
  assertJsonContract(invalid, 400);

  await fixture.request('/api/mobile/auth/register', {
    method: 'POST',
    json: REGISTRATION,
    originHeader: false,
    useCookie: false
  });
  const duplicate = await fixture.request('/api/mobile/auth/register', {
    method: 'POST',
    json: REGISTRATION,
    originHeader: false,
    useCookie: false
  });
  assertJsonContract(duplicate, 409);
});

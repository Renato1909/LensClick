import test from 'node:test';
import assert from 'node:assert/strict';
import { API_CONTRACTS, AUTH_CONTRACTS } from '../test-support/api-contracts.mjs';
import { createWorkerFixture } from '../test-support/worker-fixture.mjs';

const VALID_REGISTRATION = Object.freeze({
  name: 'Pessoa Contrato',
  email: 'contrato@example.com',
  phone: '(11) 99999-9999',
  password: 'Segura123'
});

async function fixtureFor(t, options) {
  const fixture = createWorkerFixture(options);
  t.after(() => fixture.close());
  return fixture;
}

function assertJsonContract(result, status) {
  assert.equal(result.response.status, status);
  assert.match(result.response.headers.get('content-type') || '', /^application\/json/i);
  assert.equal(result.response.headers.get('cache-control'), 'no-store');
  assert.equal(result.response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(result.response.headers.get('x-request-id') || '', /^[0-9a-f-]{36}$/i);
  assert.ok(result.json && typeof result.json === 'object');
}

function countRows(DB, table) {
  return Number(DB.prepare(`SELECT COUNT(*) AS total FROM ${table}`).first('total'));
}

async function register(fixture, registration = VALID_REGISTRATION) {
  return fixture.request('/api/auth/register', { method: 'POST', json: registration, useCookie: false });
}

function resetTokenFrom(fixture) {
  const html = fixture.sentEmails.at(-1)?.body?.htmlContent || '';
  const match = /[?&]token=([A-Za-z0-9_-]{40,100})/.exec(html.replaceAll('&amp;', '&'));
  assert.ok(match, 'o e-mail de teste deve conter um token de redefinicao');
  return match[1];
}

test('manifesto da API registra 40 rotas e 45 contratos sem duplicatas', () => {
  assert.equal(API_CONTRACTS.length, 45);
  assert.equal(new Set(API_CONTRACTS.map(({ method, route }) => `${method} ${route}`)).size, 45);
  assert.equal(new Set(API_CONTRACTS.map(({ route }) => route)).size, 40);
  assert.deepEqual(
    AUTH_CONTRACTS.map(({ method, route }) => `${method} ${route}`),
    [
      'POST /api/auth/register',
      'POST /api/auth/login',
      'POST /api/auth/password-reset/request',
      'POST /api/auth/password-reset/confirm',
      'POST /api/auth/email/verify',
      'POST /api/auth/email/resend',
      'POST /api/auth/logout',
      'GET /api/auth/me'
    ]
  );
});

test('POST /api/auth/register preserva o contrato de criacao e validacao', async (t) => {
  const fixture = await fixtureFor(t);

  const created = await register(fixture);
  assertJsonContract(created, 201);
  assert.equal(created.json.user.email, VALID_REGISTRATION.email);
  assert.match(created.response.headers.get('set-cookie') || '', /lensclick_session=.*HttpOnly; SameSite=Lax/);
  assert.match(created.response.headers.get('set-cookie') || '', /Secure/);
  assert.equal(countRows(fixture.DB, 'users'), 1);
  assert.equal(countRows(fixture.DB, 'sessions'), 1);
  const stored = fixture.DB.prepare('SELECT password_hash FROM users WHERE email = ?')
    .bind(VALID_REGISTRATION.email).first();
  assert.match(stored.password_hash, /^pbkdf2-sha256\$100000\$/);
  assert.doesNotMatch(stored.password_hash, /Segura123/);

  const duplicate = await register(fixture);
  assertJsonContract(duplicate, 409);
  assert.equal(countRows(fixture.DB, 'users'), 1);

  const invalid = await register(fixture, { ...VALID_REGISTRATION, email: 'invalido' });
  assertJsonContract(invalid, 400);
  assert.equal(countRows(fixture.DB, 'users'), 1);

  const foreignOrigin = await fixture.request('/api/auth/register', {
    method: 'POST',
    json: { ...VALID_REGISTRATION, email: 'outra@example.com' },
    originHeader: 'https://site-malicioso.test',
    useCookie: false
  });
  assertJsonContract(foreignOrigin, 403);
  assert.equal(countRows(fixture.DB, 'users'), 1);

  const unsupportedMedia = await fixture.request('/api/auth/register', {
    method: 'POST', body: 'name=Pessoa', headers: { 'Content-Type': 'text/plain' }, useCookie: false
  });
  assertJsonContract(unsupportedMedia, 415);
  assert.equal(countRows(fixture.DB, 'users'), 1);
});

test('POST /api/auth/register rejeita JSON invalido e payload excessivo sem persistir', async (t) => {
  const fixture = await fixtureFor(t);
  const malformed = await fixture.request('/api/auth/register', {
    method: 'POST', body: '{', headers: { 'Content-Type': 'application/json' }, useCookie: false
  });
  assertJsonContract(malformed, 400);

  const oversized = await fixture.request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'x'.repeat(700_001) }),
    headers: { 'Content-Type': 'application/json' },
    useCookie: false
  });
  assertJsonContract(oversized, 413);
  assert.equal(countRows(fixture.DB, 'users'), 0);
});

test('POST /api/auth/login autentica sem revelar a causa de credenciais invalidas', async (t) => {
  const fixture = await fixtureFor(t);
  await register(fixture);
  fixture.cookie = '';

  const authenticated = await fixture.request('/api/auth/login', {
    method: 'POST', json: { email: 'CONTRATO@example.com', password: 'Segura123' }, useCookie: false
  });
  assertJsonContract(authenticated, 200);
  assert.equal(authenticated.json.user.email, VALID_REGISTRATION.email);
  assert.equal('password_hash' in authenticated.json.user, false);

  const wrongPassword = await fixture.request('/api/auth/login', {
    method: 'POST', json: { email: VALID_REGISTRATION.email, password: 'Errada123' }, useCookie: false
  });
  const unknownEmail = await fixture.request('/api/auth/login', {
    method: 'POST', json: { email: 'naoexiste@example.com', password: 'Errada123' }, useCookie: false
  });
  assertJsonContract(wrongPassword, 401);
  assertJsonContract(unknownEmail, 401);
  assert.deepEqual(wrongPassword.json, unknownEmail.json);
});

test('novos acessos limitam cada conta a cinco sessoes ativas sem afetar outros usuarios', async (t) => {
  const fixture = await fixtureFor(t);
  const primary = await register(fixture);
  const primaryCookies = [primary.response.headers.get('set-cookie').split(';')[0]];

  const secondary = await register(fixture, {
    ...VALID_REGISTRATION,
    name: 'Pessoa Secundaria',
    email: 'secundaria@example.com'
  });
  const secondaryCookie = secondary.response.headers.get('set-cookie').split(';')[0];

  for (let index = 0; index < 6; index += 1) {
    const login = await fixture.request('/api/auth/login', {
      method: 'POST',
      json: { email: VALID_REGISTRATION.email, password: VALID_REGISTRATION.password },
      useCookie: false
    });
    assertJsonContract(login, 200);
    primaryCookies.push(login.response.headers.get('set-cookie').split(';')[0]);
  }

  const primaryUserId = fixture.DB.prepare('SELECT id FROM users WHERE email = ?')
    .bind(VALID_REGISTRATION.email).first('id');
  assert.equal(
    fixture.DB.prepare('SELECT COUNT(*) AS total FROM sessions WHERE user_id = ?')
      .bind(primaryUserId).first('total'),
    5
  );
  assert.equal(countRows(fixture.DB, 'sessions'), 6);

  let activePrimarySessions = 0;
  for (const cookie of primaryCookies) {
    const session = await fixture.request('/api/auth/me', {
      headers: { Cookie: cookie },
      useCookie: false
    });
    if (session.response.status === 200) activePrimarySessions += 1;
  }
  assert.equal(activePrimarySessions, 5);

  const newest = await fixture.request('/api/auth/me', {
    headers: { Cookie: primaryCookies.at(-1) },
    useCookie: false
  });
  assertJsonContract(newest, 200);

  const otherUser = await fixture.request('/api/auth/me', {
    headers: { Cookie: secondaryCookie },
    useCookie: false
  });
  assertJsonContract(otherUser, 200);
  assert.equal(otherUser.json.user.email, 'secundaria@example.com');
});

test('POST /api/auth/logout remove apenas a sessao apresentada e limpa o cookie', async (t) => {
  const fixture = await fixtureFor(t);
  await register(fixture);
  assert.equal(countRows(fixture.DB, 'sessions'), 1);

  const loggedOut = await fixture.request('/api/auth/logout', { method: 'POST', json: {} });
  assertJsonContract(loggedOut, 200);
  assert.deepEqual(loggedOut.json, { ok: true });
  assert.match(loggedOut.response.headers.get('set-cookie') || '', /Max-Age=0/);
  assert.equal(countRows(fixture.DB, 'sessions'), 0);

  const idempotent = await fixture.request('/api/auth/logout', { method: 'POST', json: {}, useCookie: false });
  assertJsonContract(idempotent, 200);
  assert.equal(countRows(fixture.DB, 'sessions'), 0);
});

test('GET /api/auth/me devolve somente a conta da sessao valida', async (t) => {
  const fixture = await fixtureFor(t);
  await register(fixture);

  const authenticated = await fixture.request('/api/auth/me');
  assertJsonContract(authenticated, 200);
  assert.equal(authenticated.json.user.email, VALID_REGISTRATION.email);
  assert.equal('password_hash' in authenticated.json.user, false);

  const anonymous = await fixture.request('/api/auth/me', { useCookie: false });
  assertJsonContract(anonymous, 401);

  fixture.DB.prepare('UPDATE sessions SET expires_at = 0').run();
  const expired = await fixture.request('/api/auth/me');
  assertJsonContract(expired, 401);
});

test('POST /api/auth/password-reset/request mantem resposta generica e entrega assincrona', async (t) => {
  const fixture = await fixtureFor(t, { enableEmail: true });
  await register(fixture);
  fixture.cookie = '';

  const known = await fixture.request('/api/auth/password-reset/request', {
    method: 'POST', json: { email: VALID_REGISTRATION.email, language: 'pt' }, useCookie: false
  });
  await fixture.executionContext.settle();
  const unknown = await fixture.request('/api/auth/password-reset/request', {
    method: 'POST', json: { email: 'naoexiste@example.com', language: 'en' }, useCookie: false
  });
  await fixture.executionContext.settle();
  assertJsonContract(known, 202);
  assertJsonContract(unknown, 202);
  assert.deepEqual(known.json, unknown.json);
  assert.equal(fixture.sentEmails.length, 2);
  assert.equal(fixture.sentEmails[0].url, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(fixture.sentEmails[1].url, 'https://api.brevo.com/v3/smtp/email');
  assert.match(fixture.sentEmails[0].body.subject, /Confirme|Confirm/i);
  assert.equal(countRows(fixture.DB, 'password_reset_tokens'), 1);

  const invalid = await fixture.request('/api/auth/password-reset/request', {
    method: 'POST', json: { email: 'invalido' }, useCookie: false
  });
  assertJsonContract(invalid, 400);
  assert.equal(fixture.sentEmails.length, 2);
});

test('POST /api/auth/password-reset/request falha fechado sem configuracao e limpa token se o Brevo rejeitar', async (t) => {
  const unavailable = await fixtureFor(t);
  const noConfiguration = await unavailable.request('/api/auth/password-reset/request', {
    method: 'POST', json: { email: VALID_REGISTRATION.email }, useCookie: false
  });
  assertJsonContract(noConfiguration, 503);
  assert.equal(countRows(unavailable.DB, 'password_reset_tokens'), 0);

  const rejected = await fixtureFor(t, {
    enableEmail: true,
    env: { BREVO_FETCH: async () => Response.json({ error: 'rejected' }, { status: 500 }) }
  });
  await register(rejected);
  const accepted = await rejected.request('/api/auth/password-reset/request', {
    method: 'POST', json: { email: VALID_REGISTRATION.email }, useCookie: false
  });
  assertJsonContract(accepted, 202);
  await rejected.executionContext.settle();
  assert.equal(countRows(rejected.DB, 'password_reset_tokens'), 0);
  assert.ok(rejected.observabilityEvents.some(({ event }) => event.event === 'email.password_reset.delivery_failed'));
});

test('POST /api/auth/password-reset/confirm consome o token uma vez e revoga sessoes', async (t) => {
  const fixture = await fixtureFor(t, { enableEmail: true });
  await register(fixture);
  const originalCookie = fixture.cookie;
  await fixture.request('/api/auth/password-reset/request', {
    method: 'POST', json: { email: VALID_REGISTRATION.email }, useCookie: false
  });
  await fixture.executionContext.settle();
  const token = resetTokenFrom(fixture);

  const confirmed = await fixture.request('/api/auth/password-reset/confirm', {
    method: 'POST', json: { token, password: 'SenhaNova2' }, useCookie: false
  });
  assertJsonContract(confirmed, 200);
  assert.equal(countRows(fixture.DB, 'sessions'), 0);
  assert.equal(countRows(fixture.DB, 'password_reset_tokens'), 0);

  fixture.cookie = originalCookie;
  const revoked = await fixture.request('/api/auth/me');
  assertJsonContract(revoked, 401);

  const reused = await fixture.request('/api/auth/password-reset/confirm', {
    method: 'POST', json: { token, password: 'OutraNova3' }, useCookie: false
  });
  assertJsonContract(reused, 400);

  const newPassword = await fixture.request('/api/auth/login', {
    method: 'POST', json: { email: VALID_REGISTRATION.email, password: 'SenhaNova2' }, useCookie: false
  });
  assertJsonContract(newPassword, 200);
});

test('POST /api/auth/password-reset/confirm rejeita dados invalidos e token expirado sem trocar a senha', async (t) => {
  const fixture = await fixtureFor(t, { enableEmail: true });
  await register(fixture);

  const invalidToken = await fixture.request('/api/auth/password-reset/confirm', {
    method: 'POST', json: { token: 'curto', password: 'SenhaNova2' }, useCookie: false
  });
  const weakPassword = await fixture.request('/api/auth/password-reset/confirm', {
    method: 'POST', json: { token: 'A'.repeat(43), password: 'semnumero' }, useCookie: false
  });
  assertJsonContract(invalidToken, 400);
  assertJsonContract(weakPassword, 400);

  await fixture.request('/api/auth/password-reset/request', {
    method: 'POST', json: { email: VALID_REGISTRATION.email }, useCookie: false
  });
  await fixture.executionContext.settle();
  const token = resetTokenFrom(fixture);
  fixture.DB.prepare('UPDATE password_reset_tokens SET expires_at = 0').run();
  const expired = await fixture.request('/api/auth/password-reset/confirm', {
    method: 'POST', json: { token, password: 'SenhaNova2' }, useCookie: false
  });
  assertJsonContract(expired, 400);

  const oldPassword = await fixture.request('/api/auth/login', {
    method: 'POST', json: { email: VALID_REGISTRATION.email, password: 'Segura123' }, useCookie: false
  });
  assertJsonContract(oldPassword, 200);
});

test('rotas de autenticacao preservam 404 para metodos nao suportados', async (t) => {
  const fixture = await fixtureFor(t);
  for (const contract of AUTH_CONTRACTS) {
    const method = contract.method === 'GET' ? 'POST' : 'GET';
    const result = await fixture.request(contract.route, {
      method,
      ...(method === 'POST' ? { json: {} } : {}),
      useCookie: false
    });
    assertJsonContract(result, 404);
  }
});

test('limites de requisicao das rotas de autenticacao retornam 429', async (t) => {
  const cases = [
    { path: '/api/auth/register', attempts: 9, json: { ...VALID_REGISTRATION, name: '' } },
    { path: '/api/auth/login', attempts: 11, json: { email: 'naoexiste@example.com', password: 'Segura123' } },
    { path: '/api/auth/password-reset/request', attempts: 6, json: { email: 'naoexiste@example.com' }, enableEmail: true },
    { path: '/api/auth/password-reset/confirm', attempts: 11, json: { token: 'A'.repeat(43), password: 'SenhaNova2' } }
  ];

  for (const scenario of cases) {
    await t.test(scenario.path, async (subtest) => {
      const fixture = await fixtureFor(subtest, { enableEmail: scenario.enableEmail });
      let result;
      for (let attempt = 0; attempt < scenario.attempts; attempt += 1) {
        result = await fixture.request(scenario.path, { method: 'POST', json: scenario.json, useCookie: false });
      }
      assertJsonContract(result, 429);
    });
  }
});

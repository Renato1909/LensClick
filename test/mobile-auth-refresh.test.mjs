import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkerFixture } from '../test-support/worker-fixture.mjs';

const REGISTRATION = {
  name: 'Pessoa Refresh', email: 'refresh@example.com', phone: '(11) 99999-9999', password: 'Segura123'
};

async function registerMobile(fixture, overrides = {}) {
  const result = await fixture.request('/api/mobile/auth/register', {
    method: 'POST',
    json: { ...REGISTRATION, deviceName: 'Android Studio', appVersion: '1.2.3', ...overrides },
    useCookie: false
  });
  assert.equal(result.response.status, 201);
  return result.json.session;
}

test('refresh rotaciona o token: antigo para de autenticar, novo funciona', async (t) => {
  const fixture = createWorkerFixture();
  t.after(() => fixture.close());
  const session = await registerMobile(fixture);
  const oldToken = session.accessToken;

  const refreshed = await fixture.request('/api/mobile/auth/refresh', {
    method: 'POST', useCookie: false, headers: { Authorization: `Bearer ${oldToken}` }
  });
  assert.equal(refreshed.response.status, 200);
  assert.notEqual(refreshed.json.session.accessToken, oldToken);
  assert.match(refreshed.json.session.accessToken, /^[A-Za-z0-9_-]{40,200}$/);
  assert.match(refreshed.json.session.expiresAt, /^\d{4}-\d{2}-\d{2}T/);

  // token rotacionado nao autentica mais nas rotas de conta
  const me = await fixture.request('/api/mobile/auth/me', {
    method: 'GET', useCookie: false, headers: { Authorization: `Bearer ${oldToken}` }
  });
  assert.equal(me.response.status, 401);

  const meNew = await fixture.request('/api/mobile/auth/me', {
    method: 'GET', useCookie: false, headers: { Authorization: `Bearer ${refreshed.json.session.accessToken}` }
  });
  assert.equal(meNew.response.status, 200);
  assert.equal(meNew.json.user.email, REGISTRATION.email);
});

test('GET /me devolve session.expiresAt para agendar refresh proativo', async (t) => {
  const fixture = createWorkerFixture();
  t.after(() => fixture.close());
  const session = await registerMobile(fixture);
  const me = await fixture.request('/api/mobile/auth/me', {
    method: 'GET', useCookie: false, headers: { Authorization: `Bearer ${session.accessToken}` }
  });
  assert.equal(me.response.status, 200);
  assert.match(me.json.session.expiresAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('replay de token rotacionado fora da janela revoga a cadeia movel e audita', async (t) => {
  const fixture = createWorkerFixture();
  t.after(() => fixture.close());
  const session = await registerMobile(fixture);
  const oldToken = session.accessToken;

  const refreshed = await fixture.request('/api/mobile/auth/refresh', {
    method: 'POST', useCookie: false, headers: { Authorization: `Bearer ${oldToken}` }
  });
  assert.equal(refreshed.response.status, 200);

  // Simula que a rotacao aconteceu ha muito tempo (fora da janela de tolerancia)
  fixture.DB.prepare('UPDATE sessions SET rotated_at = 1 WHERE rotated_at IS NOT NULL').run();

  const replay = await fixture.request('/api/mobile/auth/refresh', {
    method: 'POST', useCookie: false, headers: { Authorization: `Bearer ${oldToken}` }
  });
  assert.equal(replay.response.status, 401);
  assert.equal(replay.json.code, 'token_reuse');

  // Toda a cadeia movel foi revogada, incluindo o sucessor
  const meNew = await fixture.request('/api/mobile/auth/me', {
    method: 'GET', useCookie: false, headers: { Authorization: `Bearer ${refreshed.json.session.accessToken}` }
  });
  assert.equal(meNew.response.status, 401);

  const audit = fixture.DB.prepare("SELECT event FROM mobile_auth_audit WHERE user_id = (SELECT id FROM users WHERE email = ?) ORDER BY id")
    .bind(REGISTRATION.email).all();
  const events = audit.results.map((row) => row.event);
  assert.ok(events.includes('login') || events.includes('register'));
  assert.ok(events.includes('refresh'));
  assert.ok(events.includes('replay_reuse'));
});

test('rotacao concorrente e benigna: token antigo dentro da janela de 60s nao revoga a cadeia', async (t) => {
  const fixture = createWorkerFixture();
  t.after(() => fixture.close());
  const session = await registerMobile(fixture);
  const oldToken = session.accessToken;

  const refreshed = await fixture.request('/api/mobile/auth/refresh', {
    method: 'POST', useCookie: false, headers: { Authorization: `Bearer ${oldToken}` }
  });
  assert.equal(refreshed.response.status, 200);

  // Reapresenta o token antigo dentro da janela (request paralelo)
  const parallel = await fixture.request('/api/mobile/auth/refresh', {
    method: 'POST', useCookie: false, headers: { Authorization: `Bearer ${oldToken}` }
  });
  assert.equal(parallel.response.status, 401);
  assert.equal(parallel.json.code, 'token_rotated');

  // O sucessor continua valido
  const meNew = await fixture.request('/api/mobile/auth/me', {
    method: 'GET', useCookie: false, headers: { Authorization: `Bearer ${refreshed.json.session.accessToken}` }
  });
  assert.equal(meNew.response.status, 200);
});

test('login: 5 falhas bloqueiam a conta no bucket; sucesso limpa o contador', async (t) => {
  const fixture = createWorkerFixture();
  t.after(() => fixture.close());
  await fixture.request('/api/mobile/auth/register', {
    method: 'POST', json: { ...REGISTRATION, deviceName: null, appVersion: null }, useCookie: false
  });

  for (let i = 0; i < 5; i += 1) {
    const failed = await fixture.request('/api/mobile/auth/login', {
      method: 'POST', json: { email: REGISTRATION.email, password: 'Errada123' }, useCookie: false
    });
    assert.equal(failed.response.status, 401);
  }

  const locked = await fixture.request('/api/mobile/auth/login', {
    method: 'POST', json: { email: REGISTRATION.email, password: REGISTRATION.password }, useCookie: false
  });
  assert.equal(locked.response.status, 429);
  assert.equal(locked.json.code, 'rate_limited');

  // Reset direto do bucket para testar o caminho de sucesso -> limpeza
  fixture.DB.prepare('DELETE FROM rate_limits').run();
  const ok = await fixture.request('/api/mobile/auth/login', {
    method: 'POST', json: { email: REGISTRATION.email, password: REGISTRATION.password }, useCookie: false
  });
  assert.equal(ok.response.status, 200);
  const { createHash } = await import('node:crypto');
  const bucket = Math.floor(Date.now() / (15 * 60 * 1000));
  const key = createHash('sha256').update(`login-fail:${REGISTRATION.email}:${bucket}`).digest('hex');
  const row = fixture.DB.prepare('SELECT request_count FROM rate_limits WHERE bucket_key = ?').bind(key).first();
  assert.equal(row, null);
});

test('refresh sem bearer ou com bearer invalido devolve 401', async (t) => {
  const fixture = createWorkerFixture();
  t.after(() => fixture.close());
  const missing = await fixture.request('/api/mobile/auth/refresh', { method: 'POST', useCookie: false });
  assert.equal(missing.response.status, 401);
  const garbage = await fixture.request('/api/mobile/auth/refresh', {
    method: 'POST', useCookie: false, headers: { Authorization: 'Bearer nao-e-um-token-valido' }
  });
  assert.equal(garbage.response.status, 401);
});

test('deviceName/appVersion sao persistidos na sessao e auditados no login', async (t) => {
  const fixture = createWorkerFixture();
  t.after(() => fixture.close());
  await registerMobile(fixture, { deviceName: 'Pixel 8', appVersion: '2.0.0' });
  const stored = fixture.DB.prepare("SELECT device_name, app_version FROM sessions WHERE kind = 'mobile' ORDER BY rowid DESC").first();
  assert.equal(stored.device_name, 'Pixel 8');
  assert.equal(stored.app_version, '2.0.0');
  const audit = fixture.DB.prepare("SELECT device_name, app_version FROM mobile_auth_audit WHERE event = 'register' ORDER BY id DESC").first();
  assert.equal(audit.device_name, 'Pixel 8');
  assert.equal(audit.app_version, '2.0.0');
});

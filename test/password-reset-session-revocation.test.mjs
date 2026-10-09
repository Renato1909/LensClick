import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkerFixture } from '../test-support/worker-fixture.mjs';

const REGISTRATION = Object.freeze({
  name: 'Pessoa Reset Multicliente',
  email: 'reset-multicliente@example.com',
  phone: '(11) 97777-6666',
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

function resetTokenFrom(fixture) {
  const html = fixture.sentEmails.at(-1)?.body?.htmlContent || '';
  const match = /[?&]token=([A-Za-z0-9_-]{40,100})/.exec(html.replaceAll('&amp;', '&'));
  assert.ok(match, 'o e-mail de teste deve conter um token de redefinicao');
  return match[1];
}

test('password-reset/confirm revoga as sessoes web e mobile do mesmo usuario (Critico 3 do ADR 001)', async (t) => {
  const fixture = createWorkerFixture({ enableEmail: true });
  t.after(() => fixture.close());

  // 1) registra o usuario
  const created = await fixture.request('/api/auth/register', {
    method: 'POST',
    json: REGISTRATION,
    useCookie: false
  });
  assertJsonContract(created, 201);

  // 2) login web (cookie) e login mobile (Bearer) — mesma tabela sessions
  const webLogin = await fixture.request('/api/auth/login', {
    method: 'POST',
    json: { email: REGISTRATION.email, password: REGISTRATION.password },
    useCookie: false
  });
  assertJsonContract(webLogin, 200);
  const webCookie = webLogin.response.headers.get('set-cookie').split(';')[0];

  const mobileLogin = await fixture.request('/api/mobile/auth/login', {
    method: 'POST',
    json: {
      email: REGISTRATION.email,
      password: REGISTRATION.password,
      deviceName: 'Android Reset Test',
      appVersion: '1.0'
    },
    originHeader: false,
    useCookie: false
  });
  assertJsonContract(mobileLogin, 200);
  const mobileToken = mobileLogin.json.session.accessToken;

  // sanidade: ambas as sessoes estao ativas antes do reset
  const webBefore = await fixture.request('/api/auth/me', {
    headers: { Cookie: webCookie },
    useCookie: false
  });
  assertJsonContract(webBefore, 200);
  const mobileBefore = await fixture.request('/api/mobile/auth/me', {
    headers: { Authorization: `Bearer ${mobileToken}` },
    useCookie: false
  });
  assertJsonContract(mobileBefore, 200);

  // 3) fluxo de reset: request (gera token no D1, entregue por e-mail) + confirm
  const requested = await fixture.request('/api/auth/password-reset/request', {
    method: 'POST',
    json: { email: REGISTRATION.email, language: 'pt' },
    useCookie: false
  });
  assertJsonContract(requested, 202);
  await fixture.executionContext.settle();
  const resetToken = resetTokenFrom(fixture);

  const confirmed = await fixture.request('/api/auth/password-reset/confirm', {
    method: 'POST',
    json: { token: resetToken, password: 'SenhaNova2' },
    useCookie: false
  });
  assertJsonContract(confirmed, 200);

  // nenhuma sessao deve restar para o usuario
  const userId = fixture.DB.prepare('SELECT id FROM users WHERE email = ?').bind(REGISTRATION.email).first('id');
  assert.equal(
    fixture.DB.prepare('SELECT COUNT(*) AS total FROM sessions WHERE user_id = ?').bind(userId).first('total'),
    0,
    'o reset de senha deve apagar todas as sessoes do usuario (web e mobile)'
  );

  // 4) cookie web e Bearer mobile passam a dar 401
  const webAfter = await fixture.request('/api/auth/me', {
    headers: { Cookie: webCookie },
    useCookie: false
  });
  assertJsonContract(webAfter, 401);

  const mobileAfter = await fixture.request('/api/mobile/auth/me', {
    headers: { Authorization: `Bearer ${mobileToken}` },
    useCookie: false
  });
  assertJsonContract(mobileAfter, 401);

  // a nova senha autentica nas duas pontas
  const webRelogin = await fixture.request('/api/auth/login', {
    method: 'POST',
    json: { email: REGISTRATION.email, password: 'SenhaNova2' },
    useCookie: false
  });
  assertJsonContract(webRelogin, 200);

  const mobileRelogin = await fixture.request('/api/mobile/auth/login', {
    method: 'POST',
    json: { email: REGISTRATION.email, password: 'SenhaNova2', deviceName: 'Android Reset Test', appVersion: '1.0' },
    originHeader: false,
    useCookie: false
  });
  assertJsonContract(mobileRelogin, 200);
});

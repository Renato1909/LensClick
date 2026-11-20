import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkerFixture } from '../test-support/worker-fixture.mjs';
import { totpCode } from '../src/twofactor.mjs';

const USER = {
  name: 'Pessoa 2FA', email: 'twofactor@example.com', password: 'Segura123',
  deviceName: 'Android', appVersion: '1.0'
};

async function register(fixture) {
  const result = await fixture.request('/api/mobile/auth/register', {
    method: 'POST', json: USER, useCookie: false
  });
  assert.equal(result.response.status, 201);
  return result.json.session.accessToken;
}

function bearer(token) {
  return { Authorization: `Bearer ${token}`, Accept: 'application/json' };
}

test('2FA ponta a ponta no app: setup, enable, desafio no login, verify TOTP e recuperação', async (t) => {
  const fixture = createWorkerFixture();
  t.after(() => fixture.close());
  await register(fixture);

  const before = await fixture.request('/api/account/2fa/status', { useCookie: false, headers: bearer(await loginToken(fixture)) });
  assert.equal(before.response.status, 200);
  assert.equal(before.json.enabled, false);
  assert.equal(before.json.method, 'totp');
  assert.ok(!JSON.stringify(before.json).includes('secret'));

  const token = await loginToken(fixture);
  const setup = await fixture.request('/api/account/2fa/setup', {
    method: 'POST', useCookie: false, headers: bearer(token)
  });
  assert.equal(setup.response.status, 200);
  assert.match(setup.json.secret, /^[A-Z2-7]{16,}$/);
  assert.match(setup.json.otpauthUrl, /^otpauth:\/\/totp\//);
  assert.equal(setup.json.recoveryCodes.length, 10);
  const { secret, recoveryCodes } = setup.json;

  const enabled = await fixture.request('/api/account/2fa/enable', {
    method: 'POST', json: { code: await totpCode(secret, Date.now()) }, useCookie: false, headers: bearer(token)
  });
  assert.equal(enabled.response.status, 200);
  assert.equal(enabled.json.success, true);

  const login = await fixture.request('/api/mobile/auth/login', {
    method: 'POST', json: USER, useCookie: false
  });
  assert.equal(login.response.status, 202);
  assert.equal(login.json.status, 'twoFactorRequired');
  assert.match(login.json.challengeToken, /^[A-Za-z0-9_-]{40,200}$/);
  assert.match(login.json.expiresAt, /^\d{4}-\d{2}-\d{2}T/);

  const wrong = await fixture.request('/api/mobile/auth/2fa/verify', {
    method: 'POST', json: { challengeToken: login.json.challengeToken, code: '000000' }, useCookie: false
  });
  assert.equal(wrong.response.status, 400);
  assert.equal(wrong.json.code, 'invalid_code');

  const verified = await fixture.request('/api/mobile/auth/2fa/verify', {
    method: 'POST', json: { challengeToken: login.json.challengeToken, code: await totpCode(secret, Date.now()) }, useCookie: false
  });
  assert.equal(verified.response.status, 200);
  assert.match(verified.json.session.accessToken, /^[A-Za-z0-9_-]{40,200}$/);
  const me = await fixture.request('/api/mobile/auth/me', { useCookie: false, headers: bearer(verified.json.session.accessToken) });
  assert.equal(me.response.status, 200);

  // Código de recuperação é de uso único
  const secondChallenge = await fixture.request('/api/mobile/auth/login', {
    method: 'POST', json: USER, useCookie: false
  });
  assert.equal(secondChallenge.response.status, 202);
  const recovery = await fixture.request('/api/mobile/auth/2fa/verify', {
    method: 'POST', json: { challengeToken: secondChallenge.json.challengeToken, code: recoveryCodes[0] }, useCookie: false
  });
  assert.equal(recovery.response.status, 200);
  const status = await fixture.request('/api/account/2fa/status', { useCookie: false, headers: bearer(recovery.json.session.accessToken) });
  assert.equal(status.json.recoveryCodesRemaining, 9);

  const thirdChallenge = await fixture.request('/api/mobile/auth/login', {
    method: 'POST', json: USER, useCookie: false
  });
  const reused = await fixture.request('/api/mobile/auth/2fa/verify', {
    method: 'POST', json: { challengeToken: thirdChallenge.json.challengeToken, code: recoveryCodes[0] }, useCookie: false
  });
  assert.equal(reused.response.status, 400);

  const disabled = await fixture.request('/api/account/2fa/disable', {
    method: 'POST', json: { password: USER.password, code: await totpCode(secret, Date.now()) },
    useCookie: false, headers: bearer(recovery.json.session.accessToken)
  });
  assert.equal(disabled.response.status, 200);
  assert.equal(disabled.json.success, true);
  const after = await fixture.request('/api/account/2fa/status', { useCookie: false, headers: bearer(recovery.json.session.accessToken) });
  assert.equal(after.response.status, 401, 'desativar 2FA revoga todas as sessões');

  const plainLogin = await fixture.request('/api/mobile/auth/login', { method: 'POST', json: USER, useCookie: false });
  assert.equal(plainLogin.response.status, 200, 'contas sem 2FA mantêm login de uma etapa');
});

async function loginToken(fixture) {
  const result = await fixture.request('/api/mobile/auth/login', { method: 'POST', json: USER, useCookie: false });
  assert.equal(result.response.status, 200);
  return result.json.session.accessToken;
}

test('2FA: desafio expirado é rejeitado e códigos inválidos consomem tentativas', async (t) => {
  const fixture = createWorkerFixture();
  t.after(() => fixture.close());
  const token = await register(fixture);
  const setup = await fixture.request('/api/account/2fa/setup', { method: 'POST', useCookie: false, headers: bearer(token) });
  const { secret } = setup.json;
  await fixture.request('/api/account/2fa/enable', {
    method: 'POST', json: { code: await totpCode(secret, Date.now()) }, useCookie: false, headers: bearer(token)
  });

  const login = await fixture.request('/api/mobile/auth/login', { method: 'POST', json: USER, useCookie: false });
  const challengeToken = login.json.challengeToken;
  fixture.DB.prepare('UPDATE two_factor_challenges SET expires_at = 1 WHERE token_hash = ?').bind(await hashFor(challengeToken)).run();
  const expired = await fixture.request('/api/mobile/auth/2fa/verify', {
    method: 'POST', json: { challengeToken, code: await totpCode(secret, Date.now()) }, useCookie: false
  });
  assert.equal(expired.response.status, 400);
  assert.equal(expired.json.code, 'invalid_challenge');

  const fresh = await fixture.request('/api/mobile/auth/login', { method: 'POST', json: USER, useCookie: false });
  for (let i = 0; i < 5; i += 1) {
    const bad = await fixture.request('/api/mobile/auth/2fa/verify', {
      method: 'POST', json: { challengeToken: fresh.json.challengeToken, code: '111111' }, useCookie: false
    });
    assert.equal(bad.response.status, 400);
  }
  const exhausted = await fixture.request('/api/mobile/auth/2fa/verify', {
    method: 'POST', json: { challengeToken: fresh.json.challengeToken, code: await totpCode(secret, Date.now()) }, useCookie: false
  });
  assert.equal(exhausted.response.status, 400);
  assert.equal(exhausted.json.code, 'invalid_challenge');
});

async function hashFor(token) {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(token).digest('hex');
}

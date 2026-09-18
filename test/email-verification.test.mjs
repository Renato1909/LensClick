import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWorkerFixture } from '../test-support/worker-fixture.mjs';
import { readCatalogs } from '../test-utils/i18n.mjs';

const VALID_REGISTRATION = Object.freeze({
  name: 'Pessoa Verificada',
  email: 'verificar@example.com',
  phone: '(11) 99999-9999',
  password: 'Segura123'
});

async function fixtureFor(t, options) {
  const fixture = createWorkerFixture(options);
  t.after(() => fixture.close());
  return fixture;
}

function verificationTokenFrom(fixture) {
  const html = fixture.sentEmails.at(-1)?.body?.htmlContent || '';
  const match = /[?&]token=([A-Za-z0-9_-]{40,100})/.exec(html.replaceAll('&amp;', '&'));
  assert.ok(match, 'o e-mail de teste deve conter um token de verificacao');
  return match[1];
}

test('cadastro envia e-mail de verificacao sem bloquear e login avisa sem bloquear', async (t) => {
  const fixture = await fixtureFor(t, { enableEmail: true });

  const created = await fixture.request('/api/auth/register', {
    method: 'POST', json: VALID_REGISTRATION, useCookie: false
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.json.user.emailVerified, false);
  assert.equal(fixture.sentEmails.length, 1);
  assert.match(fixture.sentEmails[0].body.subject, /Confirme|Confirm/i);

  const stored = fixture.DB.prepare('SELECT token_hash, user_id FROM email_verification_tokens').all().results;
  assert.equal(stored.length, 1);
  const token = verificationTokenFrom(fixture);
  assert.doesNotMatch(stored[0].token_hash, new RegExp(token.slice(0, 10)));

  const login = await fixture.request('/api/auth/login', {
    method: 'POST',
    json: { email: VALID_REGISTRATION.email, password: VALID_REGISTRATION.password },
    useCookie: false
  });
  assert.equal(login.response.status, 200);
  assert.equal(login.json.user.emailVerified, false);
});

test('POST /api/auth/email/verify consome o token uma vez e marca o e-mail', async (t) => {
  const fixture = await fixtureFor(t, { enableEmail: true });
  await fixture.request('/api/auth/register', {
    method: 'POST', json: VALID_REGISTRATION, useCookie: false
  });
  const token = verificationTokenFrom(fixture);

  const verified = await fixture.request('/api/auth/email/verify', {
    method: 'POST', json: { token }, useCookie: false
  });
  assert.equal(verified.response.status, 200);

  const row = fixture.DB.prepare('SELECT email_verified_at FROM users WHERE email = ?')
    .bind(VALID_REGISTRATION.email).first();
  assert.ok(row.email_verified_at);

  const me = await fixture.request('/api/auth/me', {});
  assert.equal(me.response.status, 200);
  assert.equal(me.json.user.emailVerified, true);

  const reused = await fixture.request('/api/auth/email/verify', {
    method: 'POST', json: { token }, useCookie: false
  });
  assert.equal(reused.response.status, 400);
});

test('POST /api/auth/email/verify rejeita token invalido e expirado', async (t) => {
  const fixture = await fixtureFor(t, { enableEmail: true });
  await fixture.request('/api/auth/register', {
    method: 'POST', json: VALID_REGISTRATION, useCookie: false
  });

  const invalid = await fixture.request('/api/auth/email/verify', {
    method: 'POST', json: { token: 'curto' }, useCookie: false
  });
  assert.equal(invalid.response.status, 400);

  const user = fixture.DB.prepare('SELECT id FROM users WHERE email = ?').bind(VALID_REGISTRATION.email).first();
  await fixture.DB.prepare('DELETE FROM email_verification_tokens WHERE user_id = ?').bind(user.id).run();
  await fixture.DB.prepare('INSERT INTO email_verification_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .bind('hash-expirado-teste', user.id, Date.now() - 1000).run();
  const unknown = await fixture.request('/api/auth/email/verify', {
    method: 'POST', json: { token: 'A'.repeat(43) }, useCookie: false
  });
  assert.equal(unknown.response.status, 400);
  const row = fixture.DB.prepare('SELECT email_verified_at FROM users WHERE email = ?')
    .bind(VALID_REGISTRATION.email).first();
  assert.equal(row.email_verified_at, null);
});

test('POST /api/auth/email/resend exige sessao e gera novo link para nao verificado', async (t) => {
  const fixture = await fixtureFor(t, { enableEmail: true });
  await fixture.request('/api/auth/register', {
    method: 'POST', json: VALID_REGISTRATION, useCookie: false
  });
  const firstToken = verificationTokenFrom(fixture);

  fixture.cookie = '';
  const unauthenticated = await fixture.request('/api/auth/email/resend', {
    method: 'POST', json: {}, useCookie: false
  });
  assert.equal(unauthenticated.response.status, 401);

  await fixture.request('/api/auth/login', {
    method: 'POST',
    json: { email: VALID_REGISTRATION.email, password: VALID_REGISTRATION.password }
  });
  const resent = await fixture.request('/api/auth/email/resend', {
    method: 'POST', json: {}
  });
  assert.equal(resent.response.status, 202);
  assert.equal(fixture.sentEmails.length, 2);
  const secondToken = verificationTokenFrom(fixture);
  assert.notEqual(secondToken, firstToken);

  const verified = await fixture.request('/api/auth/email/verify', {
    method: 'POST', json: { token: secondToken }, useCookie: false
  });
  assert.equal(verified.response.status, 200);

  const alreadyVerified = await fixture.request('/api/auth/email/resend', {
    method: 'POST', json: {}
  });
  assert.equal(alreadyVerified.response.status, 200);
});

test('POST /api/auth/email/resend falha fechado sem configuracao do Brevo', async (t) => {
  const fixture = await fixtureFor(t);
  await fixture.request('/api/auth/register', {
    method: 'POST', json: VALID_REGISTRATION, useCookie: false
  });
  await fixture.request('/api/auth/login', {
    method: 'POST',
    json: { email: VALID_REGISTRATION.email, password: VALID_REGISTRATION.password }
  });
  const unavailable = await fixture.request('/api/auth/email/resend', {
    method: 'POST', json: {}
  });
  assert.equal(unavailable.response.status, 503);
});

test('verificacao de e-mail possui tela bilingue sem inline e integracao segura', () => {
  const page = readFileSync('public/verificar-email.html', 'utf8');
  const script = readFileSync('public/verificar-email.js', 'utf8');
  const translations = readCatalogs();
  const worker = readFileSync('src/worker.mjs', 'utf8');
  const auth = readFileSync('src/auth.mjs', 'utf8');

  assert.match(page, /src="verificar-email\.js"/);
  assert.match(script, /\/api\/auth\/email\/verify/);
  assert.match(script, /\/api\/auth\/email\/resend/);
  assert.ok(translations['pt-BR']['verify.title']);
  assert.ok(translations['en-US']['verify.title']);
  assert.ok(translations['pt-BR']['verify.success']);
  assert.ok(translations['en-US']['verify.success']);
  assert.match(worker, /EMAIL_VERIFICATION_TTL_MS = 24 \* 60 \* 60 \* 1000/);
  assert.match(auth, /email_verification_tokens/);
  assert.match(auth, /email_verified_at/);
  assert.doesNotMatch(worker, /email_verification_tokens \([^)]*token[^_]/);
});

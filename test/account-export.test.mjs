import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkerFixture } from '../test-support/worker-fixture.mjs';

const ALICE = Object.freeze({
  name: 'Alice Export', email: 'alice-export@example.com',
  phone: '(11) 99999-9999', password: 'Segura123'
});
const BOB = Object.freeze({
  name: 'Bob Outro', email: 'bob-outro@example.com',
  phone: '(11) 98888-8888', password: 'Segura123'
});
const CAROL = Object.freeze({
  name: 'Carol Terceira', email: 'carol-terceira@example.com',
  phone: '(11) 97777-7777', password: 'Segura123'
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
}

function userId(fixture, email) {
  return Number(fixture.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first().id);
}

test('GET /api/account/export exige sessao', async (t) => {
  const fixture = await fixtureFor(t);
  const anonymous = await fixture.request('/api/account/export', { useCookie: false });
  assert.equal(anonymous.response.status, 401);
});

test('exportacao contem dados do titular sem credenciais nem binarios', async (t) => {
  const fixture = await fixtureFor(t);
  await registerAndLogin(fixture, ALICE);
  await registerAndLogin(fixture, BOB);
  await registerAndLogin(fixture, CAROL);
  fixture.cookie = '';

  const alice = userId(fixture, ALICE.email);
  const bob = userId(fixture, BOB.email);
  const carol = userId(fixture, CAROL.email);

  const contact = await fixture.request('/api/contact', {
    method: 'POST',
    json: { name: ALICE.name, email: ALICE.email, message: 'Quero um ensaio externo no parque.' },
    useCookie: false
  });
  assert.equal(contact.response.status, 201);
  const newsletter = await fixture.request('/api/newsletter', {
    method: 'POST', json: { email: ALICE.email }, useCookie: false
  });
  assert.equal(newsletter.response.status, 201);

  const own = fixture.DB.prepare(
    'INSERT INTO conversations (client_user_id, photographer_user_id) VALUES (?, ?)'
  ).bind(alice, bob).run();
  fixture.DB.prepare('INSERT INTO messages (conversation_id, sender_user_id, body) VALUES (?, ?, ?)')
    .bind(Number(own.meta.last_row_id), alice, 'Ola, faz ensaio externo?').run();
  const foreign = fixture.DB.prepare(
    'INSERT INTO conversations (client_user_id, photographer_user_id) VALUES (?, ?)'
  ).bind(bob, carol).run();
  fixture.DB.prepare('INSERT INTO messages (conversation_id, sender_user_id, body) VALUES (?, ?, ?)')
    .bind(Number(foreign.meta.last_row_id), carol, 'Conversa que nao e da Alice.').run();

  await registerAndLogin(fixture, ALICE);
  const exported = await fixture.request('/api/account/export', {});
  assert.equal(exported.response.status, 200);
  assert.match(exported.response.headers.get('content-disposition') || '', /attachment/);
  const data = exported.json;

  assert.ok(data.exportedAt);
  assert.ok(data.scope);
  assert.equal(data.user.email, ALICE.email);
  assert.equal(data.user.password_hash, undefined);
  assert.ok(!JSON.stringify(data).includes('pbkdf2-sha256'));
  assert.equal(data.contactMessages.length, 1);
  assert.equal(data.newsletterSubscriptions.length, 1);
  assert.equal(data.conversations.length, 1);
  assert.equal(data.messages.length, 1);
  assert.equal(data.messages[0].body, 'Ola, faz ensaio externo?');

  fixture.cookie = '';
  await registerAndLogin(fixture, BOB);
  const other = await fixture.request('/api/account/export', {});
  assert.equal(other.response.status, 200);
  assert.equal(other.json.user.email, BOB.email);
  assert.equal(other.json.contactMessages.length, 0);
  assert.equal(other.json.conversations.length, 2);
});

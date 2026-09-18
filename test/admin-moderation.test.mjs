import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWorkerFixture } from '../test-support/worker-fixture.mjs';
import { readCatalogs } from '../test-utils/i18n.mjs';

const ADMIN = Object.freeze({
  name: 'Admin Painel', email: 'painel-admin@example.com',
  phone: '(11) 99999-9999', password: 'Segura123'
});
const CLIENT = Object.freeze({
  name: 'Cliente Painel', email: 'painel-cliente@example.com',
  phone: '(11) 98888-8888', password: 'Segura123'
});
const PHOTOGRAPHER = Object.freeze({
  name: 'Foto Painel', email: 'painel-foto@example.com',
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

async function seedModerationData(fixture) {
  await registerAndLogin(fixture, ADMIN);
  fixture.DB.prepare('UPDATE users SET is_admin = 1 WHERE email = ?').bind(ADMIN.email).run();
  fixture.cookie = '';
  await registerAndLogin(fixture, CLIENT);
  fixture.cookie = '';
  await registerAndLogin(fixture, PHOTOGRAPHER);
  fixture.cookie = '';

  const client = userId(fixture, CLIENT.email);
  const photographer = userId(fixture, PHOTOGRAPHER.email);
  const request = fixture.DB.prepare(
    'INSERT INTO review_requests (client_user_id, photographer_user_id, message, status) VALUES (?, ?, ?, ?)'
  ).bind(client, photographer, 'Gostaria de um ensaio externo no parque.', 'confirmed').run();
  const requestId = Number(request.meta.last_row_id);
  const review = fixture.DB.prepare(
    "INSERT INTO reviews (request_id, client_user_id, photographer_user_id, rating, comment, status) VALUES (?, ?, ?, ?, ?, 'active')"
  ).bind(requestId, client, photographer, 2, 'Chegou atrasado e entregou poucas fotos editadas.').run();
  const conversation = fixture.DB.prepare(
    'INSERT INTO conversations (client_user_id, photographer_user_id) VALUES (?, ?)'
  ).bind(client, photographer).run();

  await registerAndLogin(fixture, ADMIN);
  return {
    reviewId: Number(review.meta.last_row_id),
    conversationId: Number(conversation.meta.last_row_id)
  };
}

test('rotas admin de moderacao exigem sessao e papel', async (t) => {
  const fixture = await fixtureFor(t);
  const ids = await seedModerationData(fixture);

  fixture.cookie = '';
  assert.equal((await fixture.request('/api/admin/reviews', { useCookie: false })).response.status, 401);
  assert.equal((await fixture.request(`/api/admin/reviews/${ids.reviewId}`, {
    method: 'PUT', json: { action: 'moderate' }, useCookie: false
  })).response.status, 401);

  await registerAndLogin(fixture, CLIENT);
  assert.equal((await fixture.request('/api/admin/reviews', {})).response.status, 403);
  assert.equal((await fixture.request(`/api/admin/conversations/${ids.conversationId}`, {
    method: 'PUT', json: { action: 'close' }
  })).response.status, 403);
});

test('admin modera e restaura avaliacao com trilha de auditoria', async (t) => {
  const fixture = await fixtureFor(t);
  const ids = await seedModerationData(fixture);

  const listed = await fixture.request('/api/admin/reviews?status=active', {});
  assert.equal(listed.response.status, 200);
  assert.equal(listed.json.reviews.length, 1);
  assert.equal(listed.json.reviews[0].photographerName, PHOTOGRAPHER.name);

  const invalid = await fixture.request(`/api/admin/reviews/${ids.reviewId}`, {
    method: 'PUT', json: { action: 'apagar' }
  });
  assert.equal(invalid.response.status, 400);

  const moderated = await fixture.request(`/api/admin/reviews/${ids.reviewId}`, {
    method: 'PUT', json: { action: 'moderate', reason: 'Linguagem ofensiva' }
  });
  assert.equal(moderated.response.status, 200);
  assert.equal(moderated.json.review.status, 'moderated');

  const audit = fixture.DB.prepare(
    "SELECT action, reason FROM review_audit WHERE review_id = ? ORDER BY id DESC"
  ).bind(ids.reviewId).all().results;
  assert.equal(audit[0].action, 'moderated');
  assert.equal(audit[0].reason, 'Linguagem ofensiva');

  const queue = await fixture.request('/api/admin/reviews?status=active', {});
  assert.equal(queue.json.reviews.length, 0);
  const moderatedQueue = await fixture.request('/api/admin/reviews?status=moderated', {});
  assert.equal(moderatedQueue.json.reviews.length, 1);

  const repeated = await fixture.request(`/api/admin/reviews/${ids.reviewId}`, {
    method: 'PUT', json: { action: 'moderate' }
  });
  assert.equal(repeated.response.status, 409);

  const restored = await fixture.request(`/api/admin/reviews/${ids.reviewId}`, {
    method: 'PUT', json: { action: 'restore' }
  });
  assert.equal(restored.response.status, 200);
  assert.equal(restored.json.review.status, 'active');

  const missing = await fixture.request('/api/admin/reviews/99999', {
    method: 'PUT', json: { action: 'moderate' }
  });
  assert.equal(missing.response.status, 404);
});

test('admin encerra e reabre conversa bloqueando mensagens', async (t) => {
  const fixture = await fixtureFor(t);
  const ids = await seedModerationData(fixture);

  const listed = await fixture.request('/api/admin/conversations?status=active', {});
  assert.equal(listed.response.status, 200);
  assert.equal(listed.json.conversations.length, 1);

  const closed = await fixture.request(`/api/admin/conversations/${ids.conversationId}`, {
    method: 'PUT', json: { action: 'close' }
  });
  assert.equal(closed.response.status, 200);
  assert.equal(closed.json.conversation.status, 'closed');

  const repeated = await fixture.request(`/api/admin/conversations/${ids.conversationId}`, {
    method: 'PUT', json: { action: 'close' }
  });
  assert.equal(repeated.response.status, 409);

  fixture.cookie = '';
  await registerAndLogin(fixture, CLIENT);
  const blocked = await fixture.request(`/api/admin/conversations/${ids.conversationId}`, {
    method: 'PUT', json: { action: 'reopen' }
  });
  assert.equal(blocked.response.status, 403);

  const message = await fixture.request(`/api/account/conversations/${ids.conversationId}/messages`, {
    method: 'POST', json: { message: 'Ainda tem interesse no ensaio?' }
  });
  assert.equal(message.response.status, 409);

  fixture.cookie = '';
  await registerAndLogin(fixture, ADMIN);
  const reopened = await fixture.request(`/api/admin/conversations/${ids.conversationId}`, {
    method: 'PUT', json: { action: 'reopen' }
  });
  assert.equal(reopened.response.status, 200);

  fixture.cookie = '';
  await registerAndLogin(fixture, CLIENT);
  const delivered = await fixture.request(`/api/account/conversations/${ids.conversationId}/messages`, {
    method: 'POST', json: { message: 'Ainda tem interesse no ensaio?' }
  });
  assert.equal(delivered.response.status, 201);
});

test('painel admin possui pagina bilingue sem inline e chaves de traducao', () => {
  const page = readFileSync('public/admin.html', 'utf8');
  const script = readFileSync('public/admin.js', 'utf8');
  const translations = readCatalogs();

  assert.match(page, /src="admin\.js"/);
  assert.match(script, /\/api\/admin\/overview/);
  assert.match(script, /\/api\/admin\/reviews/);
  assert.match(script, /\/api\/admin\/conversations/);
  assert.ok(translations['pt-BR']['admin.title']);
  assert.ok(translations['en-US']['admin.title']);
  assert.ok(translations['pt-BR']['admin.moderate']);
  assert.ok(translations['en-US']['admin.moderate']);
});

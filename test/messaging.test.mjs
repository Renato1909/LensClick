import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { API_CONTRACTS } from '../test-support/api-contracts.mjs';
import { createWorkerFixture } from '../test-support/worker-fixture.mjs';

async function register(fixture, name, email) {
  const result = await fixture.request('/api/auth/register', {
    method: 'POST', json: { name, email, phone: '(11) 99999-9999', password: 'Segura123' }, useCookie: false
  });
  assert.equal(result.response.status, 201);
  return { user: result.json.user, cookie: fixture.cookie };
}

function publishPhotographer(fixture, userId, slug = 'fotografa-mensagens') {
  fixture.DB.prepare("UPDATE users SET role = 'photographer' WHERE id = ?").bind(userId).run();
  fixture.DB.prepare(`
    INSERT INTO professional_profiles (user_id, slug, bio, specialties, city, state, availability, is_published)
    VALUES (?, ?, ?, '["wedding"]', 'Campinas', 'SP', 'available', 1)
  `).bind(userId, slug, 'Perfil profissional publicado para testar conversas persistentes.').run();
}

test('migration de mensagens preserva participantes, integridade e indices de inbox', () => {
  const database = new DatabaseSync(':memory:');
  database.exec(readFileSync('migrations/0001_initial.sql', 'utf8'));
  database.exec(readFileSync('migrations/0008_conversations_and_messages.sql', 'utf8'));
  const conversation = database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'conversations'").get();
  const message = database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'messages'").get();
  const indexes = database.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all().map(({ name }) => name);

  assert.match(conversation.sql, /UNIQUE \(client_user_id, photographer_user_id\)/);
  assert.match(conversation.sql, /CHECK \(client_user_id <> photographer_user_id\)/);
  assert.match(message.sql, /length\(trim\(body\)\) BETWEEN 1 AND 2000/);
  assert.match(message.sql, /ON DELETE CASCADE/);
  assert.ok(indexes.includes('idx_conversations_client_last_message'));
  assert.ok(indexes.includes('idx_conversations_photographer_last_message'));
  assert.ok(indexes.includes('idx_messages_conversation_created'));
  database.close();
});

test('cliente e fotografo conversam, recebem nao lidas e preservam privacidade', async (t) => {
  const fixture = createWorkerFixture();
  t.after(() => fixture.close());
  const photographer = await register(fixture, 'Fotografa Mensagens', 'foto-mensagens@example.com');
  publishPhotographer(fixture, photographer.user.id);
  const client = await register(fixture, 'Cliente Mensagens', 'cliente-mensagens@example.com');
  const clientCookie = client.cookie;

  const started = await fixture.request('/api/photographers/fotografa-mensagens/conversations', {
    method: 'POST', json: { message: 'Olá! Gostaria de conversar sobre um casamento em outubro.' }
  });
  assert.equal(started.response.status, 201);
  const conversationId = started.json.conversation.id;

  const reused = await fixture.request('/api/photographers/fotografa-mensagens/conversations', {
    method: 'POST', json: { message: 'A cerimônia será realizada em Campinas.' }
  });
  assert.equal(reused.response.status, 200);
  assert.equal(reused.json.conversation.id, conversationId);
  assert.equal(fixture.DB.prepare('SELECT COUNT(*) AS total FROM conversations').first('total'), 1);
  assert.equal(fixture.DB.prepare('SELECT COUNT(*) AS total FROM messages').first('total'), 2);

  fixture.cookie = photographer.cookie;
  const inbox = await fixture.request('/api/account/conversations');
  assert.equal(inbox.response.status, 200);
  assert.equal(inbox.json.conversations[0].counterpart.name, 'Cliente Mensagens');
  assert.equal(inbox.json.conversations[0].unreadCount, 2);
  assert.doesNotMatch(JSON.stringify(inbox.json), /cliente-mensagens@example\.com/);

  const history = await fixture.request(`/api/account/conversations/${conversationId}/messages`);
  assert.equal(history.response.status, 200);
  assert.equal(history.json.messages.length, 2);
  assert.equal(history.json.messages[0].body, 'Olá! Gostaria de conversar sobre um casamento em outubro.');

  const read = await fixture.request(`/api/account/conversations/${conversationId}/read`, { method: 'PUT', json: {} });
  assert.equal(read.response.status, 200);
  assert.equal(read.json.updated, 2);
  const reply = await fixture.request(`/api/account/conversations/${conversationId}/messages`, {
    method: 'POST', json: { message: 'Olá! Tenho disponibilidade e vou adorar conhecer os detalhes.' }
  });
  assert.equal(reply.response.status, 201);

  fixture.cookie = clientCookie;
  const clientInbox = await fixture.request('/api/account/conversations');
  assert.equal(clientInbox.json.conversations[0].counterpart.name, 'Fotografa Mensagens');
  assert.equal(clientInbox.json.conversations[0].counterpart.slug, 'fotografa-mensagens');
  assert.equal(clientInbox.json.conversations[0].unreadCount, 1);

  const outsider = await register(fixture, 'Pessoa Externa', 'externa@example.com');
  fixture.cookie = outsider.cookie;
  assert.equal((await fixture.request(`/api/account/conversations/${conversationId}/messages`)).response.status, 404);
  assert.equal((await fixture.request(`/api/account/conversations/${conversationId}/read`, { method: 'PUT', json: {} })).response.status, 404);
});

test('criacao de conversa exige cliente, perfil publicado e mensagem valida', async (t) => {
  const fixture = createWorkerFixture();
  t.after(() => fixture.close());
  const photographer = await register(fixture, 'Fotografa Restrita', 'restrita@example.com');
  publishPhotographer(fixture, photographer.user.id, 'fotografa-restrita');

  assert.equal((await fixture.request('/api/photographers/fotografa-restrita/conversations', {
    method: 'POST', json: { message: 'Tentativa iniciada pelo papel incorreto.' }
  })).response.status, 403);

  const client = await register(fixture, 'Cliente Restrito', 'cliente-restrito@example.com');
  fixture.cookie = client.cookie;
  assert.equal((await fixture.request('/api/photographers/fotografa-restrita/conversations', {
    method: 'POST', json: { message: '   ' }
  })).response.status, 400);
  assert.equal((await fixture.request('/api/photographers/fotografa-restrita/conversations', {
    method: 'POST', json: { message: 'x'.repeat(2001) }
  })).response.status, 400);
  assert.equal((await fixture.request('/api/photographers/nao-publicado/conversations', {
    method: 'POST', json: { message: 'Mensagem para um perfil que não existe.' }
  })).response.status, 404);
  assert.equal(fixture.DB.prepare('SELECT COUNT(*) AS total FROM conversations').first('total'), 0);
});

test('manifesto registra os cinco contratos autenticados de mensagens', () => {
  assert.deepEqual(
    API_CONTRACTS.filter(({ area }) => area === 'messaging').map(({ method, route }) => `${method} ${route}`),
    [
      'POST /api/photographers/:slug/conversations',
      'GET /api/account/conversations',
      'GET /api/account/conversations/:id/messages',
      'POST /api/account/conversations/:id/messages',
      'PUT /api/account/conversations/:id/read'
    ]
  );
});

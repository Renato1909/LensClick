import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkerFixture } from '../test-support/worker-fixture.mjs';

async function register(fixture, name, email, role = 'client') {
  const result = await fixture.request('/api/auth/register', {
    method: 'POST', json: { name, email, phone: '(11) 99999-9999', password: 'Segura123' }, useCookie: false
  });
  assert.equal(result.response.status, 201);
  if (role === 'photographer') {
    fixture.DB.prepare("UPDATE users SET role = 'photographer' WHERE id = ?").bind(result.json.user.id).run();
    fixture.DB.prepare(`
      INSERT INTO professional_profiles (user_id, slug, bio, specialties, city, state, availability, is_published)
      VALUES (?, ?, ?, '["wedding"]', 'Campinas', 'SP', 'available', 1)
    `).bind(result.json.user.id, 'foto-android', 'Perfil publicado para testes de contrato Android.').run();
  }
  const login = await fixture.request('/api/mobile/auth/login', {
    method: 'POST', json: { email, password: 'Segura123', deviceName: 'Android', appVersion: '1.0' }, useCookie: false
  });
  assert.equal(login.response.status, 200);
  return { id: result.json.user.id, cookie: result.cookie, token: login.json.session.accessToken };
}

function bearer(token) {
  return { Authorization: `Bearer ${token}`, Accept: 'application/json' };
}

test('Bearer sem Origin: conversas, mensagens, avaliação, exportação e exclusão', async (t) => {
  const fixture = createWorkerFixture();
  t.after(() => fixture.close());
  const photographer = await register(fixture, 'Foto Android', 'foto-android@example.com', 'photographer');
  const client = await register(fixture, 'Cliente Android', 'cliente-android@example.com');

  // Iniciar conversa por slug — antes exigia Origin e retornava 403 no app
  const started = await fixture.request('/api/photographers/foto-android/conversations', {
    method: 'POST', json: { message: 'Gostaria de conhecer seu trabalho.' }, useCookie: false, headers: bearer(client.token)
  });
  assert.equal(started.response.status, 201);
  assert.equal(started.json.conversation.counterpartName, 'Foto Android');
  assert.equal(started.json.conversation.unreadCount, 0, 'remetente não tem não-lidas próprias');
  const photographerInbox = await fixture.request('/api/account/conversations', { useCookie: false, headers: bearer(photographer.token) });
  assert.equal(photographerInbox.json.conversations[0].unreadCount, 1);
  const conversationId = started.json.conversation.id;

  const sent = await fixture.request(`/api/account/conversations/${conversationId}/messages`, {
    method: 'POST', json: { message: 'Segunda mensagem do cliente.' }, useCookie: false, headers: bearer(client.token)
  });
  assert.equal(sent.response.status, 201);
  assert.equal(sent.json.message.text, 'Segunda mensagem do cliente.');
  assert.equal(sent.json.message.isMine, true);

  const received = await fixture.request(`/api/account/conversations/${conversationId}/messages`, {
    useCookie: false, headers: bearer(photographer.token)
  });
  assert.equal(received.response.status, 200);
  assert.equal(received.json.messages.every((m) => m.isMine === false), true);
  assert.equal(received.json.messages.some((m) => m.text === 'Segunda mensagem do cliente.' && m.isMine === false), true);

  const read = await fixture.request(`/api/account/conversations/${conversationId}/read`, {
    method: 'PUT', useCookie: false, headers: bearer(photographer.token)
  });
  assert.equal(read.response.status, 200);

  // Avaliação direta exige contato confirmado (verificação preservada)
  const tooSoon = await fixture.request('/api/photographers/foto-android/reviews', {
    method: 'POST', json: { rating: 5, comment: 'Trabalho excelente, recomendo.' }, useCookie: false, headers: bearer(client.token)
  });
  assert.equal(tooSoon.response.status, 403);
  assert.equal(tooSoon.json.code, 'review_not_eligible');

  const requested = await fixture.request('/api/photographers/foto-android/review-requests', {
    method: 'POST', json: { message: 'Trabalhei com este fotografo e quero avaliar.' }, useCookie: false, headers: bearer(client.token)
  });
  assert.equal(requested.response.status, 201);
  const requestId = requested.json.request.id;
  const confirmed = await fixture.request(`/api/account/review-requests/${requestId}`, {
    method: 'PUT', json: { status: 'confirmed' }, useCookie: false, headers: bearer(photographer.token)
  });
  assert.equal(confirmed.response.status, 200);
  const reviewed = await fixture.request('/api/photographers/foto-android/reviews', {
    method: 'POST', json: { rating: 5, comment: 'Trabalho excelente, recomendo.' }, useCookie: false, headers: bearer(client.token)
  });
  assert.equal(reviewed.response.status, 201);

  const list = await fixture.request('/api/photographers/foto-android/reviews', { useCookie: false });
  assert.equal(list.response.status, 200);
  assert.equal(list.json.summary.total, 1);
  assert.equal(list.json.reviews[0].authorName, 'Cliente Android');

  // Exportação e exclusão com Bearer, sem Origin
  const exported = await fixture.request('/api/account/export', { useCookie: false, headers: bearer(client.token) });
  assert.equal(exported.response.status, 200);
  assert.equal(exported.json.user.email, 'cliente-android@example.com');

  const badConfirm = await fixture.request('/api/account', {
    method: 'DELETE', json: { currentPassword: 'Segura123', confirmation: 'ERRADO' }, useCookie: false, headers: bearer(client.token)
  });
  assert.equal(badConfirm.response.status, 400);
  const deleted = await fixture.request('/api/account', {
    method: 'DELETE', json: { currentPassword: 'Segura123', confirmation: 'EXCLUIR' }, useCookie: false, headers: bearer(client.token)
  });
  assert.equal(deleted.response.status, 200);
  const after = await fixture.request('/api/mobile/auth/me', { useCookie: false, headers: bearer(client.token) });
  assert.equal(after.response.status, 401);
});

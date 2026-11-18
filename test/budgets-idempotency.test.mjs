import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkerFixture } from '../test-support/worker-fixture.mjs';

async function register(fixture, name, email) {
  const result = await fixture.request('/api/auth/register', {
    method: 'POST', json: { name, email, phone: '(11) 99999-9999', password: 'Segura123' }, useCookie: false
  });
  assert.equal(result.response.status, 201);
  return { user: result.json.user, cookie: fixture.cookie };
}

async function setupPhotographer(fixture, name, email, slug) {
  const photographer = await register(fixture, name, email);
  fixture.DB.prepare("UPDATE users SET role = 'photographer' WHERE id = ?").bind(photographer.user.id).run();
  fixture.DB.prepare(`
    INSERT INTO professional_profiles (user_id, slug, bio, specialties, city, state, availability, is_published)
    VALUES (?, ?, ?, '["wedding"]', 'Campinas', 'SP', 'available', 1)
  `).bind(photographer.user.id, slug, 'Perfil profissional publicado para os testes de idempotencia.').run();
  return photographer;
}

const validRequest = {
  eventType: 'Casamento', eventDate: '2026-12-10', place: 'Campinas, SP', duration: '4 horas',
  description: 'Cerimonia e festa de casamento com 100 convidados.', additionalInfo: 'Area externa'
};

const KEY = 'idem-test-00000001';
const KEY_2 = 'idem-test-00000002';

test('Idempotency-Key: retry devolve a resposta gravada sem duplicar a escrita', async (t) => {
  const fixture = createWorkerFixture();
  t.after(() => fixture.close());
  await setupPhotographer(fixture, 'Fotografa Idem', 'foto-idem@example.com', 'fotografa-idem');
  await register(fixture, 'Cliente Idem', 'cliente-idem@example.com');

  const headers = { 'Idempotency-Key': KEY };
  const first = await fixture.request('/api/photographers/fotografa-idem/budget-requests', { method: 'POST', json: validRequest, headers });
  assert.equal(first.response.status, 201);
  assert.equal(first.response.headers.get('idempotency-replayed'), 'false');
  const requestId = first.json.request.id;

  const retry = await fixture.request('/api/photographers/fotografa-idem/budget-requests', { method: 'POST', json: validRequest, headers });
  assert.equal(retry.response.status, 201);
  assert.equal(retry.response.headers.get('idempotency-replayed'), 'true');
  assert.equal(retry.json.request.id, requestId);

  const count = fixture.DB.prepare('SELECT COUNT(*) AS total FROM budget_requests WHERE client_user_id = (SELECT id FROM users WHERE email = ?)').bind('cliente-idem@example.com').first('total');
  assert.equal(count, 1);
  const audit = fixture.DB.prepare('SELECT COUNT(*) AS total FROM budget_audit WHERE request_id = ?').bind(requestId).first('total');
  assert.equal(audit, 1);
});

test('Idempotency-Key: mesma chave com conteudo diferente devolve 409', async (t) => {
  const fixture = createWorkerFixture();
  t.after(() => fixture.close());
  await setupPhotographer(fixture, 'Fotografa Idem2', 'foto-idem2@example.com', 'fotografa-idem2');
  await register(fixture, 'Cliente Idem2', 'cliente-idem2@example.com');

  const headers = { 'Idempotency-Key': KEY_2 };
  const first = await fixture.request('/api/photographers/fotografa-idem2/budget-requests', { method: 'POST', json: validRequest, headers });
  assert.equal(first.response.status, 201);

  const conflict = await fixture.request('/api/photographers/fotografa-idem2/budget-requests', {
    method: 'POST', json: { ...validRequest, description: 'Outra descricao totalmente diferente para o mesmo pedido duplicado.' }, headers
  });
  assert.equal(conflict.response.status, 409);
  assert.equal(conflict.json.code, 'idempotency_key_reuse');
});

test('Idempotency-Key: formato invalido devolve 400 e nao executa a escrita', async (t) => {
  const fixture = createWorkerFixture();
  t.after(() => fixture.close());
  await setupPhotographer(fixture, 'Fotografa Idem3', 'foto-idem3@example.com', 'fotografa-idem3');
  await register(fixture, 'Cliente Idem3', 'cliente-idem3@example.com');

  const bad = await fixture.request('/api/photographers/fotografa-idem3/budget-requests', {
    method: 'POST', json: validRequest, headers: { 'Idempotency-Key': '!!' }
  });
  assert.equal(bad.response.status, 400);
  assert.equal(bad.json.code, 'invalid_payload');
  const count = fixture.DB.prepare('SELECT COUNT(*) AS total FROM budget_requests').first('total');
  assert.equal(count, 0);
});

test('Idempotency-Key: proposta e acao de aceite fazem replay sem duplicar', async (t) => {
  const fixture = createWorkerFixture();
  t.after(() => fixture.close());
  const photographer = await setupPhotographer(fixture, 'Fotografa Idem4', 'foto-idem4@example.com', 'fotografa-idem4');
  const client = await register(fixture, 'Cliente Idem4', 'cliente-idem4@example.com');
  const clientCookie = client.cookie;

  const created = await fixture.request('/api/photographers/fotografa-idem4/budget-requests', { method: 'POST', json: validRequest });
  const requestId = created.json.request.id;

  fixture.cookie = photographer.cookie;
  const proposalHeaders = { 'Idempotency-Key': 'idem-test-proposta-1' };
  const proposed = await fixture.request(`/api/account/budget-requests/${requestId}/proposals`, {
    method: 'POST', json: { priceCents: 180000, conditions: 'Valor fechado.' }, headers: proposalHeaders
  });
  assert.equal(proposed.response.status, 201);
  assert.equal(proposed.response.headers.get('idempotency-replayed'), 'false');
  const proposalId = proposed.json.proposal.id;

  const proposalRetry = await fixture.request(`/api/account/budget-requests/${requestId}/proposals`, {
    method: 'POST', json: { priceCents: 180000, conditions: 'Valor fechado.' }, headers: proposalHeaders
  });
  assert.equal(proposalRetry.response.status, 201);
  assert.equal(proposalRetry.response.headers.get('idempotency-replayed'), 'true');
  assert.equal(proposalRetry.json.proposal.id, proposalId);
  const pendingCount = fixture.DB.prepare('SELECT COUNT(*) AS total FROM proposals WHERE request_id = ?').bind(requestId).first('total');
  assert.equal(pendingCount, 1);

  fixture.cookie = clientCookie;
  const acceptHeaders = { 'Idempotency-Key': 'idem-test-aceite-0001' };
  const accepted = await fixture.request(`/api/account/budget-requests/${requestId}`, {
    method: 'PUT', json: { action: 'accept', proposalId }, headers: acceptHeaders
  });
  assert.equal(accepted.response.status, 200);
  const acceptRetry = await fixture.request(`/api/account/budget-requests/${requestId}`, {
    method: 'PUT', json: { action: 'accept', proposalId }, headers: acceptHeaders
  });
  assert.equal(acceptRetry.response.status, 200);
  assert.equal(acceptRetry.response.headers.get('idempotency-replayed'), 'true');
  assert.equal(acceptRetry.json.request.status, 'accepted');
  const audit = fixture.DB.prepare("SELECT COUNT(*) AS total FROM budget_audit WHERE request_id = ? AND action = 'accepted'").bind(requestId).first('total');
  assert.equal(audit, 1);
});

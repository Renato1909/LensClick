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
  `).bind(photographer.user.id, slug, 'Perfil profissional publicado para os testes de codigos de erro.').run();
  return photographer;
}

const validRequest = {
  eventType: 'Casamento', eventDate: '2026-12-10', place: 'Campinas, SP', duration: '4 horas',
  description: 'Cerimonia e festa de casamento com 100 convidados.', additionalInfo: 'Area externa'
};

test('erros do contrato de orcamento trazem code estavel', async (t) => {
  const fixture = createWorkerFixture();
  t.after(() => fixture.close());
  await setupPhotographer(fixture, 'Fotografa Codes', 'foto-codes@example.com', 'fotografa-codes');
  const client = await register(fixture, 'Cliente Codes', 'cliente-codes@example.com');

  // invalid_payload: descricao curta
  const badPayload = await fixture.request('/api/photographers/fotografa-codes/budget-requests', {
    method: 'POST', json: { ...validRequest, description: 'curta' }
  });
  assert.equal(badPayload.response.status, 400);
  assert.equal(badPayload.json.code, 'invalid_payload');

  // not_found: fotografo inexistente
  const missing = await fixture.request('/api/photographers/nao-existe/budget-requests', {
    method: 'POST', json: validRequest
  });
  assert.equal(missing.response.status, 404);
  assert.equal(missing.json.code, 'not_found');

  // cria o pedido e força conflict na duplicidade ativa
  const created = await fixture.request('/api/photographers/fotografa-codes/budget-requests', { method: 'POST', json: validRequest });
  assert.equal(created.response.status, 201);
  const duplicate = await fixture.request('/api/photographers/fotografa-codes/budget-requests', { method: 'POST', json: validRequest });
  assert.equal(duplicate.response.status, 409);
  assert.equal(duplicate.json.code, 'conflict');

  // invalid_state: aceitar pedido ainda 'pending' (sem proposta)
  const requestId = created.json.request.id;
  const acceptTooEarly = await fixture.request(`/api/account/budget-requests/${requestId}`, {
    method: 'PUT', json: { action: 'accept', proposalId: 999 }
  });
  assert.equal(acceptTooEarly.response.status, 409);
  assert.equal(acceptTooEarly.json.code, 'invalid_state');

  // invalid_payload: acao desconhecida
  const unknownAction = await fixture.request(`/api/account/budget-requests/${requestId}`, {
    method: 'PUT', json: { action: 'explodir' }
  });
  assert.equal(unknownAction.response.status, 400);
  assert.equal(unknownAction.json.code, 'invalid_payload');

  // unauthenticated: sem credenciais
  const anonymous = await fixture.request('/api/account/budget-requests', { useCookie: false, originHeader: 'http://localhost' });
  assert.equal(anonymous.response.status, 401);
  assert.equal(anonymous.json.code, 'unauthenticated');

  // forbidden_role: cliente tentando enviar proposta
  const clientProposal = await fixture.request(`/api/account/budget-requests/${requestId}/proposals`, {
    method: 'POST', json: { priceCents: 1000 }
  });
  assert.equal(clientProposal.response.status, 403);
  assert.equal(clientProposal.json.code, 'forbidden_role');
});

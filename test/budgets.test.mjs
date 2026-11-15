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
  `).bind(photographer.user.id, slug, 'Perfil profissional publicado para os testes de orcamento e propostas.').run();
  return photographer;
}

const validRequest = {
  eventType: 'Casamento', eventDate: '2026-12-10', place: 'Campinas, SP', duration: '4 horas',
  description: 'Cerimonia e festa de casamento com 100 convidados.', additionalInfo: 'Area externa'
};

test('fluxo completo de orcamento: pedido, proposta, aceite, agenda e auditoria', async (t) => {
  const fixture = createWorkerFixture();
  t.after(() => fixture.close());
  const photographer = await setupPhotographer(fixture, 'Fotografa Orcamento', 'foto-orc@example.com', 'fotografa-orcamento');
  const client = await register(fixture, 'Cliente Orcamento', 'cliente-orc@example.com');
  const clientCookie = client.cookie;

  const created = await fixture.request('/api/photographers/fotografa-orcamento/budget-requests', { method: 'POST', json: validRequest });
  assert.equal(created.response.status, 201);
  const requestId = created.json.request.id;

  const duplicate = await fixture.request('/api/photographers/fotografa-orcamento/budget-requests', { method: 'POST', json: validRequest });
  assert.equal(duplicate.response.status, 409);

  fixture.cookie = photographer.cookie;
  const incoming = await fixture.request('/api/account/budget-requests');
  assert.equal(incoming.response.status, 200);
  assert.equal(incoming.json.role, 'photographer');
  assert.equal(incoming.json.requests[0].counterpartName, 'Cliente Orcamento');

  const proposed = await fixture.request(`/api/account/budget-requests/${requestId}/proposals`, { method: 'POST', json: { priceCents: 250000, conditions: 'Inclui ensaio pre-wedding.' } });
  assert.equal(proposed.response.status, 201);
  const proposalId = proposed.json.proposal.id;

  fixture.cookie = clientCookie;
  const detail = await fixture.request(`/api/account/budget-requests/${requestId}`);
  assert.equal(detail.response.status, 200);
  assert.equal(detail.json.request.status, 'proposed');
  assert.equal(detail.json.request.proposals[0].priceCents, 250000);

  const accepted = await fixture.request(`/api/account/budget-requests/${requestId}`, { method: 'PUT', json: { action: 'accept', proposalId } });
  assert.equal(accepted.response.status, 200);
  assert.equal(accepted.json.request.status, 'accepted');

  fixture.cookie = photographer.cookie;
  const agenda = await fixture.request('/api/account/agenda');
  assert.equal(agenda.response.status, 200);
  assert.equal(agenda.json.events.length, 1);
  assert.equal(agenda.json.events[0].clientName, 'Cliente Orcamento');

  assert.equal(fixture.DB.prepare('SELECT COUNT(*) AS total FROM budget_audit WHERE request_id = ?').bind(requestId).first('total'), 3);
});

test('autorizacao por papel e participante', async (t) => {
  const fixture = createWorkerFixture();
  t.after(() => fixture.close());
  const photographer = await setupPhotographer(fixture, 'Fotografa Auth', 'foto-auth@example.com', 'fotografa-auth');
  const client = await register(fixture, 'Cliente Auth', 'cliente-auth@example.com');
  const other = await register(fixture, 'Outro Cliente', 'outro-auth@example.com');

  fixture.cookie = photographer.cookie;
  assert.equal((await fixture.request('/api/photographers/fotografa-auth/budget-requests', { method: 'POST', json: validRequest })).response.status, 403);

  fixture.cookie = client.cookie;
  const created = await fixture.request('/api/photographers/fotografa-auth/budget-requests', { method: 'POST', json: validRequest });
  const requestId = created.json.request.id;
  assert.equal((await fixture.request(`/api/account/budget-requests/${requestId}/proposals`, { method: 'POST', json: { priceCents: 1000 } })).response.status, 403);

  fixture.cookie = other.cookie;
  assert.equal((await fixture.request(`/api/account/budget-requests/${requestId}`)).response.status, 403);

  fixture.cookie = photographer.cookie;
  const proposed = await fixture.request(`/api/account/budget-requests/${requestId}/proposals`, { method: 'POST', json: { priceCents: 1000 } });
  const proposalId = proposed.json.proposal.id;

  fixture.cookie = other.cookie;
  assert.equal((await fixture.request(`/api/account/budget-requests/${requestId}`, { method: 'PUT', json: { action: 'accept', proposalId } })).response.status, 403);
});

test('recusa e cancelamento de pedido', async (t) => {
  const fixture = createWorkerFixture();
  t.after(() => fixture.close());
  const photographer = await setupPhotographer(fixture, 'Fotografa Recusa', 'foto-rec@example.com', 'fotografa-recusa');
  const client = await register(fixture, 'Cliente Recusa', 'cliente-rec@example.com');
  const clientCookie = client.cookie;
  const created = await fixture.request('/api/photographers/fotografa-recusa/budget-requests', { method: 'POST', json: validRequest });
  const requestId = created.json.request.id;

  fixture.cookie = photographer.cookie;
  const proposed = await fixture.request(`/api/account/budget-requests/${requestId}/proposals`, { method: 'POST', json: { priceCents: 1000 } });
  const proposalId = proposed.json.proposal.id;

  fixture.cookie = clientCookie;
  const rejected = await fixture.request(`/api/account/budget-requests/${requestId}`, { method: 'PUT', json: { action: 'reject', proposalId } });
  assert.equal(rejected.response.status, 200);
  assert.equal(rejected.json.request.status, 'rejected');

  const second = await fixture.request('/api/photographers/fotografa-recusa/budget-requests', { method: 'POST', json: validRequest });
  assert.equal(second.response.status, 201);
  const secondId = second.json.request.id;
  const cancelled = await fixture.request(`/api/account/budget-requests/${secondId}`, { method: 'PUT', json: { action: 'cancel' } });
  assert.equal(cancelled.response.status, 200);
  assert.equal(cancelled.json.request.status, 'cancelled');
});

test('favoritos: adicionar, listar e remover', async (t) => {
  const fixture = createWorkerFixture();
  t.after(() => fixture.close());
  await setupPhotographer(fixture, 'Fotografa Fav', 'foto-fav@example.com', 'fotografa-fav');
  await register(fixture, 'Cliente Fav', 'cliente-fav@example.com');

  const added = await fixture.request('/api/account/favorites', { method: 'POST', json: { slug: 'fotografa-fav' } });
  assert.equal(added.response.status, 201);
  const list = await fixture.request('/api/account/favorites');
  assert.equal(list.response.status, 200);
  assert.equal(list.json.favorites.length, 1);
  assert.equal(list.json.favorites[0].slug, 'fotografa-fav');
  const photographerId = list.json.favorites[0].photographerId;
  const removed = await fixture.request(`/api/account/favorites/${photographerId}`, { method: 'DELETE' });
  assert.equal(removed.response.status, 200);
  assert.equal((await fixture.request('/api/account/favorites')).json.favorites.length, 0);
});

test('validacao de campos do pedido', async (t) => {
  const fixture = createWorkerFixture();
  t.after(() => fixture.close());
  await setupPhotographer(fixture, 'Fotografa Val', 'foto-val@example.com', 'fotografa-val');
  await register(fixture, 'Cliente Val', 'cliente-val@example.com');
  assert.equal((await fixture.request('/api/photographers/fotografa-val/budget-requests', { method: 'POST', json: { ...validRequest, description: 'curta' } })).response.status, 400);
  assert.equal((await fixture.request('/api/photographers/fotografa-val/budget-requests', { method: 'POST', json: { ...validRequest, eventDate: '10/12/2026' } })).response.status, 400);
  assert.equal((await fixture.request('/api/photographers/fotografa-inexistente/budget-requests', { method: 'POST', json: validRequest })).response.status, 404);
});

test('rotas de orcamento aceitam Bearer movel sem Origin', async (t) => {
  const fixture = createWorkerFixture();
  t.after(() => fixture.close());
  await setupPhotographer(fixture, 'Fotografa Bearer', 'foto-bearer@example.com', 'fotografa-bearer');
  await register(fixture, 'Cliente Bearer', 'cliente-bearer@example.com');
  const login = await fixture.request('/api/mobile/auth/login', {
    method: 'POST', json: { email: 'cliente-bearer@example.com', password: 'Segura123', deviceName: 'Android', appVersion: '1.0' }, useCookie: false
  });
  assert.equal(login.response.status, 200);
  const token = login.json.session.accessToken;
  const created = await fixture.request('/api/photographers/fotografa-bearer/budget-requests', {
    method: 'POST', json: validRequest, useCookie: false, originHeader: null, headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(created.response.status, 201);
});
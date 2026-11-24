import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createWorkerFixture } from '../test-support/worker-fixture.mjs';

async function user(fixture, name, slug = null) {
  const email = `${name.toLowerCase().replaceAll(' ', '-')}@bookings.test`;
  const password = 'ValidOnly123';
  const registration = await fixture.request('/api/auth/register', {
    method: 'POST', json: { name, email, phone: '11999999999', password }, useCookie: false
  });
  assert.equal(registration.response.status, 201, JSON.stringify(registration.json));
  const id = registration.json.user.id;
  if (slug) {
    fixture.DB.prepare("UPDATE users SET role = 'photographer' WHERE id = ?").bind(id).run();
    fixture.DB.prepare(`
      INSERT INTO professional_profiles (user_id, slug, bio, specialties, city, state, is_published, starting_price_cents)
      VALUES (?, ?, 'Perfil publicado para testar a contratação.', '["wedding"]', 'Campinas', 'SP', 1, 200000)`
    ).bind(id, slug).run();
  }
  const login = await fixture.request('/api/mobile/auth/login', { method: 'POST', json: { email, password }, useCookie: false });
  assert.equal(login.response.status, 200, JSON.stringify(login.json));
  return {
    id,
    request: (path, method = 'GET', json) => fixture.request(path, {
      method, json, headers: { Authorization: `Bearer ${login.json.session.accessToken}` },
      useCookie: false, originHeader: false
    })
  };
}

const futureDate = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);
const pastDate = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
const form = (extras = {}) => ({
  reference: randomUUID(), eventType: 'Casamento', category: 'wedding',
  description: 'Cobertura da cerimônia e da festa.', eventDate: futureDate, start: '15:00', end: '17:00',
  venue: 'Salão da Festa', address: 'Rua Exemplo, 999', city: 'Campinas', state: 'SP',
  venueDetails: 'Entrada lateral', notes: 'Fotografar os avós', paymentMethod: 'cash', priceCents: 200000, ...extras
});

test('contratação com Bearer valida carga, pagamento, participantes, histórico e avaliação única', async (t) => {
  const fixture = createWorkerFixture();
  t.after(() => fixture.close());
  const photographer = await user(fixture, 'Foto Eventos', 'foto-eventos');
  const client = await user(fixture, 'Cliente Inicial');
  const stranger = await user(fixture, 'Cliente Alheio');
  const createPath = '/api/photographers/foto-eventos/engagements';
  const draft = form();
  assert.equal((await photographer.request(createPath, 'POST', draft)).response.status, 403);
  for (const input of [form({ end: '14:00' }), form({ state: 'ZZ' }), form({ eventDate: '2027-02-30' }), form({ eventDate: pastDate })]) {
    assert.equal((await client.request(createPath, 'POST', input)).response.status, 400);
  }
  assert.equal((await client.request(createPath, 'POST', form({ priceCents: 123 }))).response.status, 409);
  const created = await client.request(createPath, 'POST', draft);
  assert.equal(created.response.status, 201, JSON.stringify(created.json));
  const booking = created.json.engagement;
  assert.equal(booking.priceCents, 200000);
  assert.equal(booking.currency, 'BRL');
  assert.equal(booking.feeCents, 0);
  assert.equal(booking.paymentStatus, 'awaiting_cash');
  assert.equal((await client.request(createPath, 'POST', draft)).json.engagement.id, booking.id);
  assert.equal((await client.request(createPath, 'POST', { ...draft, notes: 'Um conteúdo diferente.' })).response.status, 409);
  assert.equal((await client.request(createPath, 'POST', form())).response.status, 409);
  const competing = await stranger.request(createPath, 'POST', form({ paymentMethod: 'pix' }));
  assert.equal(competing.response.status, 201);

  const path = `/api/account/engagements/${booking.id}`;
  assert.equal((await stranger.request(path)).response.status, 404);
  assert.equal((await client.request(path, 'PUT', { action: 'accept' })).response.status, 403);
  const review = { rating: 5, comment: 'Excelente trabalho do início ao fim.' };
  assert.equal((await client.request(path + '/review', 'POST', review)).response.status, 409);
  assert.equal((await photographer.request(path, 'PUT', { action: 'accept' })).json.engagement.status, 'accepted');
  assert.equal((await photographer.request(`/api/account/engagements/${competing.json.engagement.id}`, 'PUT', { action: 'accept' })).response.status, 409);
  assert.equal((await photographer.request(path, 'PUT', { action: 'deliver' })).json.code, 'event_not_finished');
  assert.equal((await client.request(path, 'PUT', { action: 'receive_cash' })).response.status, 403);
  assert.equal((await photographer.request(path, 'PUT', { action: 'receive_cash' })).json.engagement.paymentStatus, 'cash_received');
  assert.equal((await client.request(path, 'PUT', { action: 'cancel' })).response.status, 409);
  fixture.DB.prepare('UPDATE engagements SET event_date = ? WHERE id = ?').bind(pastDate, booking.id).run();
  assert.equal((await photographer.request(path, 'PUT', { action: 'deliver' })).json.engagement.status, 'delivered');
  assert.equal((await client.request(path, 'PUT', { action: 'complete' })).json.engagement.status, 'completed');
  assert.equal((await photographer.request(path + '/review', 'POST', review)).response.status, 403);
  assert.equal((await stranger.request(path + '/review', 'POST', review)).response.status, 404);
  assert.equal((await client.request(path + '/review', 'POST', { ...review, rating: 6 })).response.status, 400);
  const posted = await Promise.all([client.request(path + '/review', 'POST', review), client.request(path + '/review', 'POST', review)]);
  assert.deepEqual(posted.map(result => result.response.status).sort(), [201, 409]);
  const detail = (await client.request(path)).json;
  assert.equal(detail.engagement.reviewPublished, true);
  assert.deepEqual(detail.history.map(row => [row.status, row.paymentStatus]), [
    ['pending', 'awaiting_cash'], ['accepted', 'awaiting_cash'], ['accepted', 'cash_received'],
    ['delivered', 'cash_received'], ['completed', 'cash_received']
  ]);
  assert.equal((await client.request('/api/account/engagements')).json.engagements.length, 1);
  assert.equal((await photographer.request('/api/account/engagements')).json.engagements.length, 2);
  assert.equal((await client.request('/api/account/export')).json.engagements[0].id, booking.id);
  const publicReviews = (await fixture.request('/api/photographers/foto-eventos/reviews')).json;
  assert.deepEqual(publicReviews.summary, { total: 1, average: 5 });
  assert.deepEqual(publicReviews.distribution, { 1: 0, 2: 0, 3: 0, 4: 0, 5: 1 });
  assert.equal(publicReviews.reviews[0].authorName, 'Cliente Inicial');
  assert.ok(publicReviews.reviews[0].createdAt);
  const ranking = await fixture.request('/api/photographers?sort=rating_rank');
  assert.equal(ranking.response.headers.get('cache-control'), 'no-store');
  assert.equal(ranking.json.sort, 'rating_rank');
  assert.equal(ranking.json.photographers[0].reviewCount, 1);
});

test('proposta aceita define preço, orçamento pode ser recusado e pagamentos digitais exigem gateway', async (t) => {
  const fixture = createWorkerFixture();
  t.after(() => fixture.close());
  const photographer = await user(fixture, 'Foto Pacotes', 'foto-pacotes');
  const client = await user(fixture, 'Cliente Pacotes');
  const quotePath = '/api/photographers/foto-pacotes/budget-requests';
  const quote = { eventType: 'Casamento', eventDate: futureDate, place: 'Campinas', description: 'Cerimônia e retratos dos noivos.' };
  const sendQuote = async () => {
    const response = await client.request(quotePath, 'POST', quote);
    assert.equal(response.response.status, 201, JSON.stringify(response.json));
    return `/api/account/budget-requests/${response.json.request.id}`;
  };
  const declinedPath = await sendQuote();
  assert.equal((await client.request(declinedPath, 'PUT', { action: 'decline' })).response.status, 403);
  const proposal = { priceCents: 245000, conditions: 'Inclui fotos editadas.' };
  assert.equal((await photographer.request(declinedPath + '/proposals', 'POST', proposal)).response.status, 201);
  assert.equal((await photographer.request(declinedPath, 'PUT', { action: 'decline' })).json.request.status, 'rejected');
  const declined = (await client.request(declinedPath)).json.request;
  assert.equal(declined.proposals[0].status, 'withdrawn');
  assert.deepEqual(declined.history.map(row => row.action), ['created', 'proposed', 'rejected']);

  const path = await sendQuote();
  const sent = await photographer.request(path + '/proposals', 'POST', proposal);
  const proposalId = sent.json.proposal.id;
  assert.equal((await client.request(path, 'PUT', { action: 'accept', proposalId })).json.request.status, 'accepted');
  const accepted = (await client.request(path)).json.request;
  assert.deepEqual(accepted.photographerSpecialties, ['wedding']);
  assert.equal(accepted.photographerName, 'Foto Pacotes');
  const bookingPath = '/api/photographers/foto-pacotes/engagements';
  assert.equal((await client.request(bookingPath, 'POST', form({ proposalId }))).response.status, 409);
  const digital = await client.request(bookingPath, 'POST', form({ proposalId, priceCents: 245000, paymentMethod: 'pix' }));
  assert.equal(digital.response.status, 201, JSON.stringify(digital.json));
  assert.equal(digital.json.engagement.paymentStatus, 'gateway_required');
  assert.equal((await client.request(bookingPath, 'POST', form({ proposalId, priceCents: 245000, start: '18:00', end: '19:00' }))).response.status, 409);
  for (const [paymentMethod, start, end] of [['credit_card', '18:00', '19:00'], ['debit_card', '19:00', '20:00']]) {
    const booking = await client.request(bookingPath, 'POST', form({ paymentMethod, start, end }));
    assert.equal(booking.response.status, 201);
    assert.equal(booking.json.engagement.paymentStatus, 'gateway_required');
    const bookingDetail = `/api/account/engagements/${booking.json.engagement.id}`;
    assert.equal((await photographer.request(bookingDetail, 'PUT', { action: 'accept' })).response.status, 200);
    assert.equal((await photographer.request(bookingDetail, 'PUT', { action: 'receive_cash' })).response.status, 409);
  }
});

test('ranking favorece histórico consistente e devolve a imagem de capa', async (t) => {
  const fixture = createWorkerFixture();
  t.after(() => fixture.close());
  const established = await user(fixture, 'Foto Constante', 'foto-constante');
  const newcomer = await user(fixture, 'Foto Nova', 'foto-nova');
  const client = await user(fixture, 'Cliente Historico');
  const insertRequest = fixture.DB.prepare(`
    INSERT INTO review_requests (client_user_id, photographer_user_id, message, status) VALUES (?, ?, 'Contato legado.', 'confirmed')`);
  const insertReview = fixture.DB.prepare(`
    INSERT INTO reviews (request_id, client_user_id, photographer_user_id, rating, comment) VALUES (?, ?, ?, ?, 'Avaliação histórica existente.')`);
  for (const [photographer, scores] of [[newcomer, [5]], [established, [5, 4, 5, 4, 5, 5, 5, 5]]]) {
    for (const rating of scores) {
      const requestId = insertRequest.bind(client.id, photographer.id).run().meta.last_row_id;
      insertReview.bind(requestId, client.id, photographer.id, rating).run();
    }
  }
  fixture.DB.prepare(`
    INSERT INTO portfolio_items (user_id, object_key, alt_text, position, is_cover) VALUES (?, 'cover-test', 'Foto de capa', 0, 1)`)
    .bind(established.id).run();
  const ranking = await fixture.request('/api/photographers?sort=rating_rank');
  assert.equal(ranking.response.status, 200, JSON.stringify(ranking.json));
  assert.deepEqual(ranking.json.photographers.map(row => row.slug), ['foto-constante', 'foto-nova']);
  assert.match(ranking.json.photographers[0].portfolioPreviewUrl, /foto-constante\/portfolio\/\d+/);
});

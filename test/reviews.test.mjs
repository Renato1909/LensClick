import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWorkerFixture } from '../test-support/worker-fixture.mjs';

async function register(fixture, name, email) {
  const result = await fixture.request('/api/auth/register', {
    method: 'POST', json: { name, email, phone: '(11) 99999-9999', password: 'Segura123' }, useCookie: false
  });
  assert.equal(result.response.status, 201);
  return { user: result.json.user, cookie: fixture.cookie };
}

test('avaliacao exige contato confirmado, preserva autoria e registra auditoria', async (t) => {
  const fixture = createWorkerFixture();
  t.after(() => fixture.close());

  const photographer = await register(fixture, 'Fotografa Reputacao', 'foto@example.com');
  fixture.DB.prepare("UPDATE users SET role = 'photographer' WHERE id = ?").bind(photographer.user.id).run();
  fixture.DB.prepare(`
    INSERT INTO professional_profiles (user_id, slug, bio, specialties, city, state, availability, is_published)
    VALUES (?, 'fotografa-reputacao', ?, '["wedding"]', 'Campinas', 'SP', 'available', 1)
  `).bind(photographer.user.id, 'Perfil profissional publicado para os testes de reputacao e contato confirmado.').run();

  const client = await register(fixture, 'Cliente Reputacao', 'cliente@example.com');
  const clientCookie = client.cookie;
  const request = await fixture.request('/api/photographers/fotografa-reputacao/review-requests', {
    method: 'POST', json: { message: 'Conversamos sobre um ensaio de casamento em Campinas.' }
  });
  assert.equal(request.response.status, 201);
  const requestId = request.json.request.id;

  const duplicate = await fixture.request('/api/photographers/fotografa-reputacao/review-requests', {
    method: 'POST', json: { message: 'Outra solicitacao ainda pendente para o mesmo profissional.' }
  });
  assert.equal(duplicate.response.status, 409);

  const premature = await fixture.request(`/api/account/review-requests/${requestId}/review`, {
    method: 'POST', json: { rating: 5, comment: 'Trabalho excelente e atendimento muito cuidadoso.' }
  });
  assert.equal(premature.response.status, 403);

  fixture.cookie = photographer.cookie;
  const incoming = await fixture.request('/api/account/review-requests');
  assert.equal(incoming.response.status, 200);
  assert.equal(incoming.json.role, 'photographer');
  assert.equal(incoming.json.requests[0].clientName, 'Cliente Reputacao');
  assert.equal((await fixture.request(`/api/account/review-requests/${requestId}`, {
    method: 'PUT', json: { status: 'confirmed' }
  })).response.status, 200);

  fixture.cookie = clientCookie;
  const created = await fixture.request(`/api/account/review-requests/${requestId}/review`, {
    method: 'POST', json: { rating: 5, comment: 'Trabalho excelente e atendimento muito cuidadoso.' }
  });
  assert.equal(created.response.status, 201);
  const reviewId = created.json.review.id;
  assert.equal((await fixture.request(`/api/account/review-requests/${requestId}/review`, {
    method: 'POST', json: { rating: 4, comment: 'Tentativa duplicada de avaliacao confirmada.' }
  })).response.status, 409);

  const publicReviews = await fixture.request('/api/photographers/fotografa-reputacao/reviews', { useCookie: false });
  assert.equal(publicReviews.response.status, 200);
  assert.deepEqual(publicReviews.json.summary, { total: 1, average: 5 });
  assert.equal(publicReviews.json.reviews[0].clientName, 'Cliente Reputacao');

  const updated = await fixture.request(`/api/account/reviews/${reviewId}`, {
    method: 'PUT', json: { rating: 4, comment: 'Atendimento cuidadoso e resultado muito consistente.' }
  });
  assert.equal(updated.response.status, 200);
  assert.equal((await fixture.request(`/api/account/reviews/${reviewId}`, { method: 'DELETE', json: {} })).response.status, 200);

  const afterDeletion = await fixture.request('/api/photographers/fotografa-reputacao/reviews', { useCookie: false });
  assert.deepEqual(afterDeletion.json.summary, { total: 0, average: null });
  assert.equal(fixture.DB.prepare('SELECT COUNT(*) AS total FROM review_audit WHERE review_id = ?').bind(reviewId).first('total'), 3);
  assert.equal(fixture.DB.prepare('SELECT status FROM reviews WHERE id = ?').bind(reviewId).first('status'), 'deleted');
});

test('criacao da avaliacao persiste avaliacao e auditoria no mesmo batch', () => {
  const source = `${readFileSync('src/worker.mjs', 'utf8')}\n${readFileSync('src/photographers.mjs', 'utf8')}`;
  const creation = source.slice(
    source.indexOf("if (routeId === 'account.reviews.create')"),
    source.indexOf("if (routeId === 'account.reviews.update')")
  );
  assert.match(creation, /env\.DB\.batch\(\[/);
  assert.match(creation, /INSERT INTO reviews/);
  assert.match(creation, /INSERT INTO review_audit/);
});

test('fotografo nao pode avaliar e cliente nao pode confirmar contato', async (t) => {
  const fixture = createWorkerFixture();
  t.after(() => fixture.close());
  const client = await register(fixture, 'Cliente Sem Permissao', 'cliente2@example.com');
  assert.equal((await fixture.request('/api/account/review-requests/999', {
    method: 'PUT', json: { status: 'confirmed' }
  })).response.status, 403);
  fixture.DB.prepare("UPDATE users SET role = 'photographer' WHERE id = ?").bind(client.user.id).run();
  assert.equal((await fixture.request('/api/account/review-requests/999/review', {
    method: 'POST', json: { rating: 5, comment: 'Comentario que nao deve ser persistido.' }
  })).response.status, 403);
});

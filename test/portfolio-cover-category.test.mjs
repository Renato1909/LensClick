import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkerFixture } from '../test-support/worker-fixture.mjs';

test('portfolio aceita categoria e uma capa por fotografo', async (t) => {
  const fixture = createWorkerFixture();
  t.after(async () => fixture.close());

  const registration = await fixture.request('/api/auth/register', {
    method: 'POST',
    json: { name: 'Fotografo Teste', email: 'portfolio@example.com', phone: '11999999999', password: 'Portfolio123' }
  });
  assert.equal(registration.response.status, 201);

  const profile = await fixture.request('/api/profile', {
    method: 'PUT',
    json: { ...registration.json.user, role: 'photographer' }
  });
  assert.equal(profile.response.status, 200);

  const png = new Uint8Array([137, 80, 78, 71]);
  const form = new FormData();
  form.append('image', new File([png], 'foto.png', { type: 'image/png' }));
  form.append('altText', 'Uma foto de teste');
  form.append('caption', 'Ensaio');
  form.append('category', 'portrait');

  const upload = await fixture.request('/api/account/portfolio', { method: 'POST', body: form });
  assert.equal(upload.response.status, 201);
  assert.equal(upload.json.item.category, 'portrait');
  assert.equal(upload.json.item.isCover, false);

  const invalidCategory = new FormData();
  invalidCategory.append('image', new File([png], 'foto.png', { type: 'image/png' }));
  invalidCategory.append('altText', 'Outra foto');
  invalidCategory.append('category', 'invalid');
  const rejected = await fixture.request('/api/account/portfolio', { method: 'POST', body: invalidCategory });
  assert.equal(rejected.response.status, 400);

  const saved = await fixture.request('/api/account/portfolio', {
    method: 'PUT',
    json: { items: [{ ...upload.json.item, isCover: true, category: 'portrait' }] }
  });
  assert.equal(saved.response.status, 200);
  assert.equal(saved.json.portfolio[0].isCover, true);
  assert.equal(saved.json.portfolio[0].category, 'portrait');
});

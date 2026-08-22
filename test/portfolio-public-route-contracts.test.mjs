import test from 'node:test';
import assert from 'node:assert/strict';
import { API_CONTRACTS } from '../test-support/api-contracts.mjs';
import { createWorkerFixture } from '../test-support/worker-fixture.mjs';

const ONE_PIXEL_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const IMAGE_BYTES = Buffer.from(ONE_PIXEL_PNG.split(',')[1], 'base64');

function fixtureFor(t) {
  const fixture = createWorkerFixture();
  t.after(() => fixture.close());
  return fixture;
}

function assertJsonContract(result, status) {
  assert.equal(result.response.status, status);
  assert.match(result.response.headers.get('content-type') || '', /^application\/json/i);
  assert.equal(result.response.headers.get('cache-control'), 'no-store');
  assert.equal(result.response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(result.response.headers.get('x-request-id') || '', /^[0-9a-f-]{36}$/i);
  assert.ok(result.json && typeof result.json === 'object');
}

function countRows(DB, table, where = '', values = []) {
  return Number(DB.prepare(`SELECT COUNT(*) AS total FROM ${table}${where ? ` WHERE ${where}` : ''}`)
    .bind(...values).first('total'));
}

async function setupPhotographer(fixture, {
  name = 'Fotografa Contrato',
  email = 'fotografa@example.com',
  phone = '(11) 99999-9999',
  city = 'Campinas',
  state = 'SP',
  specialties = ['wedding', 'portrait'],
  availability = 'available',
  published = true
} = {}) {
  const registration = await fixture.request('/api/auth/register', {
    method: 'POST', json: { name, email, phone, password: 'Segura123' }, useCookie: false
  });
  assertJsonContract(registration, 201);
  const user = registration.json.user;
  const account = await fixture.request('/api/profile', {
    method: 'PUT',
    json: {
      ...user, role: 'photographer', age: 30, gender: 'other', profilePic: ONE_PIXEL_PNG
    }
  });
  assertJsonContract(account, 200);
  const professional = await fixture.request('/api/account/professional-profile', {
    method: 'PUT',
    json: {
      bio: 'Fotografo historias com direcao cuidadosa, escuta ativa e uma entrega pensada para cada cliente.',
      specialties, city, state, availability, instagram: 'fotografa.contrato', isPublished: published
    }
  });
  assertJsonContract(professional, 200);
  return { user: account.json.user, profile: professional.json.profile, cookie: fixture.cookie };
}

async function uploadPortfolio(fixture, {
  altText = 'Casal caminhando ao por do sol',
  caption = 'Ensaio ao entardecer',
  type = 'image/png',
  bytes = IMAGE_BYTES
} = {}) {
  const form = new FormData();
  form.append('image', new Blob([bytes], { type }), 'imagem.png');
  form.append('altText', altText);
  form.append('caption', caption);
  return fixture.request('/api/account/portfolio', { method: 'POST', body: form });
}

test('manifesto registra os nove contratos de portfólio e descoberta pública', () => {
  const contracts = API_CONTRACTS
    .filter(({ area }) => ['portfolio', 'discovery'].includes(area))
    .map(({ method, route }) => `${method} ${route}`);
  assert.deepEqual(contracts, [
    'GET /api/photographers',
    'GET /api/photographers/:slug',
    'GET /api/photographers/:slug/photo',
    'GET /api/photographers/:slug/portfolio/:id',
    'GET /api/account/portfolio',
    'POST /api/account/portfolio',
    'PUT /api/account/portfolio',
    'GET /api/account/portfolio/:id/image',
    'DELETE /api/account/portfolio/:id'
  ]);
});

test('GET e POST /api/account/portfolio preservam autenticação, papel e validação do upload', async (t) => {
  const fixture = fixtureFor(t);
  const anonymousList = await fixture.request('/api/account/portfolio', { useCookie: false });
  assertJsonContract(anonymousList, 401);

  const client = await fixture.request('/api/auth/register', {
    method: 'POST',
    json: { name: 'Pessoa Cliente', email: 'cliente@example.com', phone: '11999999999', password: 'Segura123' },
    useCookie: false
  });
  assertJsonContract(client, 201);
  const clientUpload = await uploadPortfolio(fixture);
  assertJsonContract(clientUpload, 403);
  assert.equal(fixture.PROFILE_IMAGES.objects.size, 0);

  const photographer = await setupPhotographer(fixture);
  const objectsBeforeInvalidUploads = fixture.PROFILE_IMAGES.objects.size;
  const empty = await fixture.request('/api/account/portfolio');
  assertJsonContract(empty, 200);
  assert.deepEqual(empty.json.portfolio, []);

  const unsupportedMedia = await fixture.request('/api/account/portfolio', {
    method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' }
  });
  assertJsonContract(unsupportedMedia, 415);
  const invalidType = await uploadPortfolio(fixture, { type: 'image/gif' });
  assertJsonContract(invalidType, 400);
  const missingDescription = await uploadPortfolio(fixture, { altText: 'x' });
  assertJsonContract(missingDescription, 400);
  const emptyFile = await uploadPortfolio(fixture, { bytes: new Uint8Array() });
  assertJsonContract(emptyFile, 413);
  assert.equal(fixture.PROFILE_IMAGES.objects.size, objectsBeforeInvalidUploads);

  const created = await uploadPortfolio(fixture);
  assertJsonContract(created, 201);
  assert.equal(created.json.item.altText, 'Casal caminhando ao por do sol');
  assert.match(created.json.item.imageUrl, /^\/api\/account\/portfolio\/\d+\/image/);
  assert.equal(fixture.PROFILE_IMAGES.objects.size, objectsBeforeInvalidUploads + 1);
  assert.equal(countRows(fixture.DB, 'portfolio_items', 'user_id = ?', [photographer.user.id]), 1);
});

test('POST /api/account/portfolio respeita limite de itens, origem e frequência', async (t) => {
  const fixture = fixtureFor(t);
  const photographer = await setupPhotographer(fixture, { published: false });
  for (let position = 0; position < 12; position += 1) {
    fixture.DB.prepare(`
      INSERT INTO portfolio_items (user_id, object_key, alt_text, position) VALUES (?, ?, ?, ?)
    `).bind(photographer.user.id, `portfolio/${photographer.user.id}/limit-${position}.png`, `Imagem ${position}`, position).run();
  }
  const limitedByItems = await uploadPortfolio(fixture);
  assertJsonContract(limitedByItems, 409);
  assert.equal(fixture.PROFILE_IMAGES.puts.filter((key) => key.includes('/limit-')).length, 0);

  const foreignOrigin = await fixture.request('/api/account/portfolio', {
    method: 'POST', body: new FormData(), originHeader: 'https://site-malicioso.test'
  });
  assertJsonContract(foreignOrigin, 403);

  const rateFixture = fixtureFor(t);
  let rateLimited;
  for (let attempt = 0; attempt < 21; attempt += 1) {
    rateLimited = await rateFixture.request('/api/account/portfolio', {
      method: 'POST', body: new FormData(), useCookie: false
    });
  }
  assertJsonContract(rateLimited, 429);
});

test('PUT /api/account/portfolio atualiza somente itens pertencentes ao titular', async (t) => {
  const fixture = fixtureFor(t);
  const first = await setupPhotographer(fixture, { published: false });
  const firstUpload = await uploadPortfolio(fixture, { altText: 'Primeira imagem acessível' });
  const secondUpload = await uploadPortfolio(fixture, { altText: 'Segunda imagem acessível' });
  const firstItem = firstUpload.json.item;
  const secondItem = secondUpload.json.item;

  const invalidShape = await fixture.request('/api/account/portfolio', { method: 'PUT', json: { items: 'invalido' } });
  const duplicateIds = await fixture.request('/api/account/portfolio', {
    method: 'PUT', json: { items: [{ id: firstItem.id, altText: 'Descrição válida' }, { id: firstItem.id, altText: 'Repetida' }] }
  });
  const missingAlt = await fixture.request('/api/account/portfolio', {
    method: 'PUT', json: { items: [{ id: firstItem.id, altText: 'x' }] }
  });
  assertJsonContract(invalidShape, 400);
  assertJsonContract(duplicateIds, 400);
  assertJsonContract(missingAlt, 400);

  const updated = await fixture.request('/api/account/portfolio', {
    method: 'PUT',
    json: {
      items: [
        { id: secondItem.id, altText: 'Segunda imagem revisada', caption: 'Agora em primeiro' },
        { id: firstItem.id, altText: 'Primeira imagem revisada', caption: 'Agora em segundo' }
      ]
    }
  });
  assertJsonContract(updated, 200);
  assert.deepEqual(updated.json.portfolio.map(({ id }) => id), [secondItem.id, firstItem.id]);
  assert.equal(updated.json.portfolio[0].caption, 'Agora em primeiro');

  const foreignOrigin = await fixture.request('/api/account/portfolio', {
    method: 'PUT',
    json: { items: [] },
    originHeader: 'https://site-malicioso.test'
  });
  assertJsonContract(foreignOrigin, 403);

  const second = await setupPhotographer(fixture, {
    name: 'Segundo Fotografo', email: 'segundo@example.com', phone: '11988887777', published: false
  });
  const forbidden = await fixture.request('/api/account/portfolio', {
    method: 'PUT', json: { items: [{ id: firstItem.id, altText: 'Tentativa de outro titular' }] }
  });
  assertJsonContract(forbidden, 403);
  assert.equal(countRows(fixture.DB, 'portfolio_items', 'user_id = ?', [first.user.id]), 2);
  assert.equal(countRows(fixture.DB, 'portfolio_items', 'user_id = ?', [second.user.id]), 0);

  const anonymous = await fixture.request('/api/account/portfolio', {
    method: 'PUT', json: { items: [] }, useCookie: false
  });
  assertJsonContract(anonymous, 401);
});

test('imagem privada e exclusão do portfólio exigem propriedade e mantêm recuperação no R2', async (t) => {
  const fixture = fixtureFor(t);
  const first = await setupPhotographer(fixture, { published: false });
  const upload = await uploadPortfolio(fixture);
  const item = upload.json.item;
  const imagePath = item.imageUrl.split('?')[0];
  const objectKey = [...fixture.PROFILE_IMAGES.objects.keys()].find((key) => key.startsWith(`portfolio/${first.user.id}/`));
  fixture.PROFILE_IMAGES.objects.get(objectKey).httpEtag = '"portfolio-private-etag"';

  const image = await fixture.request(imagePath);
  assert.equal(image.response.status, 200);
  assert.equal(image.response.headers.get('content-type'), 'image/png');
  assert.match(image.response.headers.get('cache-control') || '', /^private/);
  const conditional = await fixture.request(imagePath, { headers: { 'If-None-Match': '"portfolio-private-etag"' } });
  assert.equal(conditional.response.status, 304);

  const anonymousImage = await fixture.request(imagePath, { useCookie: false });
  assertJsonContract(anonymousImage, 401);
  const anonymousDeletion = await fixture.request(`/api/account/portfolio/${item.id}`, {
    method: 'DELETE', json: {}, useCookie: false
  });
  assertJsonContract(anonymousDeletion, 401);

  const foreignDeletion = await fixture.request(`/api/account/portfolio/${item.id}`, {
    method: 'DELETE', json: {}, originHeader: 'https://site-malicioso.test'
  });
  assertJsonContract(foreignDeletion, 403);

  const second = await setupPhotographer(fixture, {
    name: 'Outro Titular', email: 'outro@example.com', phone: '11977776666', published: false
  });
  assertJsonContract(await fixture.request(imagePath), 404);
  assertJsonContract(await fixture.request(`/api/account/portfolio/${item.id}`, { method: 'DELETE', json: {} }), 404);
  assert.equal(countRows(fixture.DB, 'portfolio_items', 'user_id = ?', [first.user.id]), 1);
  assert.equal(countRows(fixture.DB, 'portfolio_items', 'user_id = ?', [second.user.id]), 0);

  fixture.cookie = first.cookie;
  fixture.PROFILE_IMAGES.failDeleteKey = objectKey;
  const failedDeletion = await fixture.request(`/api/account/portfolio/${item.id}`, { method: 'DELETE', json: {} });
  assertJsonContract(failedDeletion, 500);
  assert.equal(countRows(fixture.DB, 'portfolio_items', 'id = ?', [item.id]), 1);

  fixture.PROFILE_IMAGES.failDeleteKey = '';
  const deleted = await fixture.request(`/api/account/portfolio/${item.id}`, { method: 'DELETE', json: {} });
  assertJsonContract(deleted, 200);
  assert.equal(countRows(fixture.DB, 'portfolio_items', 'id = ?', [item.id]), 0);
  assert.equal(fixture.PROFILE_IMAGES.objects.has(objectKey), false);
  assertJsonContract(await fixture.request(`/api/account/portfolio/${item.id}`, { method: 'DELETE', json: {} }), 404);
});

test('GET /api/photographers filtra somente perfis publicados e pagina com limites estáveis', async (t) => {
  const fixture = fixtureFor(t);
  await setupPhotographer(fixture, {
    name: 'Ana Luz', email: 'ana@example.com', city: 'Campinas', state: 'SP', specialties: ['wedding'], availability: 'available'
  });
  await setupPhotographer(fixture, {
    name: 'Bruno Mar', email: 'bruno@example.com', phone: '21999998888', city: 'Niteroi', state: 'RJ',
    specialties: ['corporate'], availability: 'limited'
  });
  await setupPhotographer(fixture, {
    name: 'Rascunho Oculto', email: 'rascunho@example.com', phone: '31999997777', city: 'Campinas', state: 'SP',
    specialties: ['wedding'], published: false
  });

  const all = await fixture.request('/api/photographers', { useCookie: false });
  assert.equal(all.response.status, 200);
  assert.match(all.response.headers.get('cache-control') || '', /^public/);
  assert.equal(all.json.photographers.length, 2);
  assert.equal(all.json.pagination.total, 2);

  const filtered = await fixture.request('/api/photographers?state=SP&city=Camp&specialty=wedding&availability=available', { useCookie: false });
  assert.equal(filtered.response.status, 200);
  assert.equal(filtered.json.photographers.length, 1);
  assert.equal(filtered.json.photographers[0].name, 'Ana Luz');

  const secondPage = await fixture.request('/api/photographers?page=2&pageSize=1', { useCookie: false });
  assert.equal(secondPage.json.pagination.page, 2);
  assert.equal(secondPage.json.pagination.pageSize, 1);
  assert.equal(secondPage.json.photographers.length, 1);

  const bounded = await fixture.request('/api/photographers?page=-5&pageSize=999', { useCookie: false });
  assert.equal(bounded.json.pagination.page, 1);
  assert.equal(bounded.json.pagination.pageSize, 50);

  const injectionLike = await fixture.request('/api/photographers?city=%25%27%20OR%201%3D1--', { useCookie: false });
  assert.equal(injectionLike.response.status, 200);
  assert.equal(injectionLike.json.photographers.length, 0);
});

test('perfil público expõe somente fotógrafo publicado e contatos autorizados', async (t) => {
  const fixture = fixtureFor(t);
  const published = await setupPhotographer(fixture);
  const upload = await uploadPortfolio(fixture, { caption: 'Trabalho publicado', altText: 'Retrato publicado com segurança' });
  const profile = await fixture.request(`/api/photographers/${published.profile.slug}`, { useCookie: false });
  assert.equal(profile.response.status, 200);
  assert.match(profile.response.headers.get('cache-control') || '', /^public/);
  assert.equal(profile.json.profile.name, 'Fotografa Contrato');
  assert.equal(profile.json.profile.contacts.email, '');
  assert.equal(profile.json.profile.contacts.phone, '');
  assert.equal('publicEmail' in profile.json.profile, false);
  assert.equal('showEmail' in profile.json.profile, false);
  assert.equal('object_key' in profile.json.profile.portfolio[0], false);
  assert.equal(profile.json.profile.portfolio[0].id, upload.json.item.id);

  const draft = await setupPhotographer(fixture, {
    name: 'Perfil Rascunho', email: 'draft@example.com', phone: '11966665555', published: false
  });
  assertJsonContract(await fixture.request(`/api/photographers/${draft.profile.slug}`, { useCookie: false }), 404);
  assertJsonContract(await fixture.request('/api/photographers/slug-inexistente', { useCookie: false }), 404);

  fixture.DB.prepare("UPDATE users SET role = 'client' WHERE id = ?").bind(published.user.id).run();
  assertJsonContract(await fixture.request(`/api/photographers/${published.profile.slug}`, { useCookie: false }), 404);
});

test('foto e imagem pública do portfólio validam publicação, vínculo e cache', async (t) => {
  const fixture = fixtureFor(t);
  const published = await setupPhotographer(fixture);
  const upload = await uploadPortfolio(fixture);
  const profilePhotoPath = `/api/photographers/${published.profile.slug}/photo`;
  const publicPortfolioPath = `/api/photographers/${published.profile.slug}/portfolio/${upload.json.item.id}`;
  const profileKey = [...fixture.PROFILE_IMAGES.objects.keys()].find((key) => key.startsWith(`profiles/${published.user.id}/`));
  const portfolioKey = [...fixture.PROFILE_IMAGES.objects.keys()].find((key) => key.startsWith(`portfolio/${published.user.id}/`));
  fixture.PROFILE_IMAGES.objects.get(profileKey).httpEtag = '"public-profile-etag"';
  fixture.PROFILE_IMAGES.objects.get(portfolioKey).httpEtag = '"public-portfolio-etag"';

  const photo = await fixture.request(profilePhotoPath, { useCookie: false });
  const portfolio = await fixture.request(publicPortfolioPath, { useCookie: false });
  assert.equal(photo.response.status, 200);
  assert.equal(portfolio.response.status, 200);
  assert.match(photo.response.headers.get('cache-control') || '', /^public/);
  assert.match(portfolio.response.headers.get('cache-control') || '', /^public/);
  assert.equal((await fixture.request(profilePhotoPath, {
    headers: { 'If-None-Match': '"public-profile-etag"' }, useCookie: false
  })).response.status, 304);
  assert.equal((await fixture.request(publicPortfolioPath, {
    headers: { 'If-None-Match': '"public-portfolio-etag"' }, useCookie: false
  })).response.status, 304);

  const other = await setupPhotographer(fixture, {
    name: 'Outra Publicada', email: 'publica2@example.com', phone: '11955554444'
  });
  assertJsonContract(await fixture.request(
    `/api/photographers/${other.profile.slug}/portfolio/${upload.json.item.id}`,
    { useCookie: false }
  ), 404);

  const storedProfileObject = fixture.PROFILE_IMAGES.objects.get(profileKey);
  const storedPortfolioObject = fixture.PROFILE_IMAGES.objects.get(portfolioKey);
  fixture.PROFILE_IMAGES.objects.delete(profileKey);
  fixture.PROFILE_IMAGES.objects.delete(portfolioKey);
  assertJsonContract(await fixture.request(profilePhotoPath, { useCookie: false }), 404);
  assertJsonContract(await fixture.request(publicPortfolioPath, { useCookie: false }), 404);
  fixture.PROFILE_IMAGES.objects.set(profileKey, storedProfileObject);
  fixture.PROFILE_IMAGES.objects.set(portfolioKey, storedPortfolioObject);

  fixture.DB.prepare('UPDATE professional_profiles SET is_published = 0 WHERE user_id = ?').bind(published.user.id).run();
  assertJsonContract(await fixture.request(profilePhotoPath, { useCookie: false }), 404);
  assertJsonContract(await fixture.request(publicPortfolioPath, { useCookie: false }), 404);
});

test('contratos de portfólio e descoberta preservam 404 para métodos não suportados', async (t) => {
  const fixture = fixtureFor(t);
  const contracts = API_CONTRACTS.filter(({ area }) => ['portfolio', 'discovery'].includes(area));
  for (const contract of contracts) {
    const path = contract.route.replace(':slug', 'fotografa-1').replace(':id', '1');
    const result = await fixture.request(path, { method: 'PATCH', json: {}, useCookie: false });
    assertJsonContract(result, 404);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { API_CONTRACTS } from '../test-support/api-contracts.mjs';
import { createWorkerFixture } from '../test-support/worker-fixture.mjs';

const ONE_PIXEL_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const VALID_ACCOUNT = Object.freeze({
  name: 'Pessoa da Conta',
  email: 'conta@example.com',
  phone: '(11) 99999-9999',
  password: 'Segura123'
});

function fixtureFor(t, options) {
  const fixture = createWorkerFixture(options);
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

async function register(fixture, account = VALID_ACCOUNT) {
  return fixture.request('/api/auth/register', { method: 'POST', json: account, useCookie: false });
}

function editableProfile(user, overrides = {}) {
  return {
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    age: user.age,
    gender: user.gender,
    profilePic: user.profilePic,
    ...overrides
  };
}

test('manifesto da API registra os sete contratos autenticados de conta desta entrega', () => {
  const contracts = API_CONTRACTS
    .filter(({ area }) => ['account', 'professional-profile'].includes(area))
    .map(({ method, route }) => `${method} ${route}`);
  assert.deepEqual(contracts, [
    'GET /api/account/professional-profile',
    'PUT /api/account/professional-profile',
    'PUT /api/profile',
    'PUT /api/account/password',
    'DELETE /api/account/photo',
    'DELETE /api/account',
    'GET /api/profile-picture/:id'
  ]);
});

test('PUT /api/profile atualiza dados e foto sem expor senha ou manter objetos antigos', async (t) => {
  const fixture = fixtureFor(t);
  const registration = await register(fixture);
  const user = registration.json.user;

  const updated = await fixture.request('/api/profile', {
    method: 'PUT',
    json: editableProfile(user, {
      name: 'Pessoa Atualizada', role: 'photographer', age: 34, gender: 'other', profilePic: ONE_PIXEL_PNG
    })
  });
  assertJsonContract(updated, 200);
  assert.equal(updated.json.user.name, 'Pessoa Atualizada');
  assert.equal(updated.json.user.role, 'photographer');
  assert.match(updated.json.user.profilePic, /^\/api\/profile-picture\/\d+/);
  assert.equal('password_hash' in updated.json.user, false);
  assert.equal(fixture.PROFILE_IMAGES.objects.size, 1);
  const firstKey = [...fixture.PROFILE_IMAGES.objects.keys()][0];

  const replaced = await fixture.request('/api/profile', {
    method: 'PUT', json: editableProfile(updated.json.user, { profilePic: ONE_PIXEL_PNG })
  });
  assertJsonContract(replaced, 200);
  assert.equal(fixture.PROFILE_IMAGES.objects.size, 1);
  assert.equal(fixture.PROFILE_IMAGES.objects.has(firstKey), false);
  assert.ok(fixture.PROFILE_IMAGES.deletes.includes(firstKey));
});

test('PUT /api/profile protege autenticacao, origem, validacao e troca de e-mail', async (t) => {
  const fixture = fixtureFor(t);
  const registration = await register(fixture);
  const user = registration.json.user;
  const primaryCookie = fixture.cookie;

  const other = await register(fixture, {
    ...VALID_ACCOUNT, name: 'Outra Pessoa', email: 'outra@example.com', phone: '(11) 98888-7777'
  });
  assertJsonContract(other, 201);
  fixture.cookie = primaryCookie;

  const anonymous = await fixture.request('/api/profile', {
    method: 'PUT', json: editableProfile(user), useCookie: false
  });
  assertJsonContract(anonymous, 401);

  const foreignOrigin = await fixture.request('/api/profile', {
    method: 'PUT', json: editableProfile(user), originHeader: 'https://site-malicioso.test'
  });
  assertJsonContract(foreignOrigin, 403);

  const invalid = await fixture.request('/api/profile', {
    method: 'PUT', json: editableProfile(user, { age: 121 })
  });
  assertJsonContract(invalid, 400);

  const duplicateEmail = await fixture.request('/api/profile', {
    method: 'PUT', json: editableProfile(user, { email: 'outra@example.com', currentPassword: 'Segura123' })
  });
  assertJsonContract(duplicateEmail, 409);

  const wrongConfirmation = await fixture.request('/api/profile', {
    method: 'PUT', json: editableProfile(user, { email: 'nova@example.com', currentPassword: 'Errada123' })
  });
  assertJsonContract(wrongConfirmation, 403);
  assert.equal(fixture.DB.prepare('SELECT email FROM users WHERE id = ?').bind(user.id).first('email'), user.email);

  const secondLogin = await fixture.request('/api/auth/login', {
    method: 'POST', json: { email: user.email, password: 'Segura123' }, useCookie: false
  });
  assertJsonContract(secondLogin, 200);
  const secondaryCookie = fixture.cookie;
  fixture.cookie = primaryCookie;
  fixture.DB.prepare('INSERT INTO password_reset_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .bind('profile-email-change-token', user.id, Date.now() + 60_000).run();

  const changedEmail = await fixture.request('/api/profile', {
    method: 'PUT', json: editableProfile(user, { email: 'nova@example.com', currentPassword: 'Segura123' })
  });
  assertJsonContract(changedEmail, 200);
  assert.equal(changedEmail.json.user.email, 'nova@example.com');
  assert.equal(countRows(fixture.DB, 'password_reset_tokens', 'user_id = ?', [user.id]), 0);
  assert.equal(countRows(fixture.DB, 'sessions', 'user_id = ?', [user.id]), 1);

  fixture.cookie = secondaryCookie;
  assertJsonContract(await fixture.request('/api/auth/me'), 401);
  fixture.cookie = primaryCookie;
  assertJsonContract(await fixture.request('/api/auth/me'), 200);
});

test('GET /api/profile-picture/:id entrega somente a imagem privada do titular', async (t) => {
  const fixture = fixtureFor(t);
  const registration = await register(fixture);
  const user = registration.json.user;
  const updated = await fixture.request('/api/profile', {
    method: 'PUT', json: editableProfile(user, { profilePic: ONE_PIXEL_PNG })
  });
  const imagePath = updated.json.user.profilePic.split('?')[0];
  const key = [...fixture.PROFILE_IMAGES.objects.keys()][0];
  fixture.PROFILE_IMAGES.objects.get(key).httpEtag = '"profile-etag"';

  const image = await fixture.request(imagePath);
  assert.equal(image.response.status, 200);
  assert.equal(image.response.headers.get('content-type'), 'image/png');
  assert.match(image.response.headers.get('cache-control') || '', /^private/);
  assert.equal(image.response.headers.get('etag'), '"profile-etag"');

  const conditional = await fixture.request(imagePath, { headers: { 'If-None-Match': '"profile-etag"' } });
  assert.equal(conditional.response.status, 304);
  assert.equal(conditional.response.headers.get('x-request-id')?.length, 36);

  const anonymous = await fixture.request(imagePath, { useCookie: false });
  assertJsonContract(anonymous, 404);
  const otherIdentifier = await fixture.request(`/api/profile-picture/${Number(user.id) + 1}`);
  assertJsonContract(otherIdentifier, 404);
});

test('PUT /api/account/password valida credenciais e revoga sessoes secundarias', async (t) => {
  const fixture = fixtureFor(t);
  const registration = await register(fixture);
  const user = registration.json.user;
  const primaryCookie = fixture.cookie;
  await fixture.request('/api/auth/login', {
    method: 'POST', json: { email: user.email, password: 'Segura123' }, useCookie: false
  });
  const secondaryCookie = fixture.cookie;
  fixture.cookie = primaryCookie;
  fixture.DB.prepare('INSERT INTO password_reset_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .bind('password-change-token', user.id, Date.now() + 60_000).run();

  const wrongCurrent = await fixture.request('/api/account/password', {
    method: 'PUT', json: { currentPassword: 'Errada123', newPassword: 'SenhaNova2' }
  });
  const weak = await fixture.request('/api/account/password', {
    method: 'PUT', json: { currentPassword: 'Segura123', newPassword: 'semnumero' }
  });
  const reused = await fixture.request('/api/account/password', {
    method: 'PUT', json: { currentPassword: 'Segura123', newPassword: 'Segura123' }
  });
  assertJsonContract(wrongCurrent, 403);
  assertJsonContract(weak, 400);
  assertJsonContract(reused, 409);

  const changed = await fixture.request('/api/account/password', {
    method: 'PUT', json: { currentPassword: 'Segura123', newPassword: 'SenhaNova2' }
  });
  assertJsonContract(changed, 200);
  assert.equal(countRows(fixture.DB, 'sessions', 'user_id = ?', [user.id]), 1);
  assert.equal(countRows(fixture.DB, 'password_reset_tokens', 'user_id = ?', [user.id]), 0);

  fixture.cookie = secondaryCookie;
  assertJsonContract(await fixture.request('/api/auth/me'), 401);
  fixture.cookie = primaryCookie;
  assertJsonContract(await fixture.request('/api/auth/me'), 200);
  assertJsonContract(await fixture.request('/api/auth/login', {
    method: 'POST', json: { email: user.email, password: 'SenhaNova2' }, useCookie: false
  }), 200);
});

test('PUT /api/account/password protege acesso, origem e limite de tentativas', async (t) => {
  const fixture = fixtureFor(t);
  const anonymous = await fixture.request('/api/account/password', {
    method: 'PUT', json: { currentPassword: 'Segura123', newPassword: 'SenhaNova2' }, useCookie: false
  });
  assertJsonContract(anonymous, 401);

  const foreignOrigin = await fixture.request('/api/account/password', {
    method: 'PUT',
    json: { currentPassword: 'Segura123', newPassword: 'SenhaNova2' },
    originHeader: 'https://site-malicioso.test',
    useCookie: false
  });
  assertJsonContract(foreignOrigin, 403);

  let limited;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    limited = await fixture.request('/api/account/password', {
      method: 'PUT', json: { currentPassword: 'Segura123', newPassword: 'SenhaNova2' }, useCookie: false
    });
  }
  assertJsonContract(limited, 429);
});

test('DELETE /api/account/photo remove o objeto e despublica o perfil de forma recuperavel', async (t) => {
  const fixture = fixtureFor(t);
  const registration = await register(fixture);
  const user = registration.json.user;
  await fixture.request('/api/profile', {
    method: 'PUT', json: editableProfile(user, { role: 'photographer', profilePic: ONE_PIXEL_PNG })
  });
  fixture.DB.prepare('INSERT INTO professional_profiles (user_id, slug, is_published) VALUES (?, ?, 1)')
    .bind(user.id, `pessoa-conta-${user.id}`).run();
  const key = [...fixture.PROFILE_IMAGES.objects.keys()][0];
  fixture.PROFILE_IMAGES.failDeleteKey = key;

  const storageFailure = await fixture.request('/api/account/photo', { method: 'DELETE', json: {} });
  assertJsonContract(storageFailure, 500);
  assert.equal(fixture.DB.prepare('SELECT profile_pic_key FROM users WHERE id = ?').bind(user.id).first('profile_pic_key'), key);
  assert.equal(fixture.DB.prepare('SELECT is_published FROM professional_profiles WHERE user_id = ?').bind(user.id).first('is_published'), 1);

  fixture.PROFILE_IMAGES.failDeleteKey = '';
  const removed = await fixture.request('/api/account/photo', { method: 'DELETE', json: {} });
  assertJsonContract(removed, 200);
  assert.equal(fixture.PROFILE_IMAGES.objects.size, 0);
  assert.equal(fixture.DB.prepare('SELECT profile_pic_key FROM users WHERE id = ?').bind(user.id).first('profile_pic_key'), null);
  assert.equal(fixture.DB.prepare('SELECT is_published FROM professional_profiles WHERE user_id = ?').bind(user.id).first('is_published'), 0);

  const idempotent = await fixture.request('/api/account/photo', { method: 'DELETE', json: {} });
  assertJsonContract(idempotent, 200);
  const anonymous = await fixture.request('/api/account/photo', { method: 'DELETE', json: {}, useCookie: false });
  assertJsonContract(anonymous, 401);
});

test('DELETE /api/account exige confirmacao e preserva propriedade quando o R2 falha', async (t) => {
  const fixture = fixtureFor(t);
  const registration = await register(fixture);
  const user = registration.json.user;
  await fixture.request('/api/profile', {
    method: 'PUT', json: editableProfile(user, { profilePic: ONE_PIXEL_PNG })
  });
  const key = [...fixture.PROFILE_IMAGES.objects.keys()][0];

  assertJsonContract(await fixture.request('/api/account', {
    method: 'DELETE', json: { currentPassword: 'Segura123', confirmation: 'CONFIRMAR' }
  }), 400);
  assertJsonContract(await fixture.request('/api/account', {
    method: 'DELETE', json: { currentPassword: 'Errada123', confirmation: 'EXCLUIR' }
  }), 403);

  fixture.PROFILE_IMAGES.failDeleteKey = key;
  const storageFailure = await fixture.request('/api/account', {
    method: 'DELETE', json: { currentPassword: 'Segura123', confirmation: 'EXCLUIR' }
  });
  assertJsonContract(storageFailure, 500);
  assert.equal(countRows(fixture.DB, 'users', 'id = ?', [user.id]), 1);
  assert.equal(countRows(fixture.DB, 'sessions', 'user_id = ?', [user.id]), 1);
});

test('DELETE /api/account elimina dados controlados e preserva registros independentes', async (t) => {
  const fixture = fixtureFor(t);
  const registration = await register(fixture);
  const user = registration.json.user;
  await fixture.request('/api/profile', {
    method: 'PUT', json: editableProfile(user, { profilePic: ONE_PIXEL_PNG })
  });
  const profileKey = [...fixture.PROFILE_IMAGES.objects.keys()][0];
  const portfolioKey = `portfolio/${user.id}/contract.png`;
  await fixture.PROFILE_IMAGES.put(portfolioKey, new Uint8Array([1]), { httpMetadata: { contentType: 'image/png' } });
  fixture.DB.prepare('INSERT INTO portfolio_items (user_id, object_key, alt_text) VALUES (?, ?, ?)')
    .bind(user.id, portfolioKey, 'Imagem do contrato').run();
  fixture.DB.prepare('INSERT INTO password_reset_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .bind('account-deletion-token', user.id, Date.now() + 60_000).run();
  fixture.DB.prepare('INSERT INTO contact_messages (name, email, message) VALUES (?, ?, ?)')
    .bind(user.name, user.email, 'Mensagem independente que deve permanecer.').run();
  fixture.DB.prepare('INSERT INTO newsletter_subscriptions (email) VALUES (?)').bind(user.email).run();

  const deleted = await fixture.request('/api/account', {
    method: 'DELETE', json: { currentPassword: 'Segura123', confirmation: 'DELETE' }
  });
  assertJsonContract(deleted, 200);
  assert.match(deleted.response.headers.get('set-cookie') || '', /Max-Age=0/);
  assert.equal(countRows(fixture.DB, 'users', 'id = ?', [user.id]), 0);
  assert.equal(countRows(fixture.DB, 'sessions', 'user_id = ?', [user.id]), 0);
  assert.equal(countRows(fixture.DB, 'password_reset_tokens', 'user_id = ?', [user.id]), 0);
  assert.equal(countRows(fixture.DB, 'portfolio_items', 'user_id = ?', [user.id]), 0);
  assert.equal(countRows(fixture.DB, 'contact_messages', 'email = ?', [user.email]), 1);
  assert.equal(countRows(fixture.DB, 'newsletter_subscriptions', 'email = ?', [user.email]), 1);
  assert.equal(fixture.PROFILE_IMAGES.objects.has(profileKey), false);
  assert.equal(fixture.PROFILE_IMAGES.objects.has(portfolioKey), false);
});

test('GET e PUT /api/account/professional-profile preservam rascunho, privacidade e publicacao', async (t) => {
  const fixture = fixtureFor(t);
  const registration = await register(fixture);
  const user = registration.json.user;

  const initial = await fixture.request('/api/account/professional-profile');
  assertJsonContract(initial, 200);
  assert.equal(initial.json.profile.isPublished, false);
  assert.equal(initial.json.profile.slug, `pessoa-da-conta-${user.id}`);
  assert.equal(countRows(fixture.DB, 'professional_profiles'), 0);

  const clientAttempt = await fixture.request('/api/account/professional-profile', {
    method: 'PUT', json: { bio: 'Rascunho', isPublished: false }
  });
  assertJsonContract(clientAttempt, 403);
  assert.equal(countRows(fixture.DB, 'professional_profiles'), 0);

  const photographer = await fixture.request('/api/profile', {
    method: 'PUT', json: editableProfile(user, { role: 'photographer', profilePic: ONE_PIXEL_PNG })
  });
  assertJsonContract(photographer, 200);

  const draft = await fixture.request('/api/account/professional-profile', {
    method: 'PUT',
    json: { bio: 'Rascunho profissional', specialties: [], city: '', state: '', isPublished: false }
  });
  assertJsonContract(draft, 200);
  assert.equal(draft.json.profile.isPublished, false);

  const invalid = await fixture.request('/api/account/professional-profile', {
    method: 'PUT', json: { ...draft.json.profile, state: 'S', isPublished: false }
  });
  assertJsonContract(invalid, 400);
  assert.equal(fixture.DB.prepare('SELECT bio FROM professional_profiles WHERE user_id = ?').bind(user.id).first('bio'), 'Rascunho profissional');

  const incomplete = await fixture.request('/api/account/professional-profile', {
    method: 'PUT', json: { ...draft.json.profile, isPublished: true }
  });
  assertJsonContract(incomplete, 400);

  const published = await fixture.request('/api/account/professional-profile', {
    method: 'PUT',
    json: {
      bio: 'Fotografo historias com direcao cuidadosa, escuta ativa e uma entrega pensada para cada cliente.',
      specialties: ['wedding', 'portrait'], city: 'Campinas', state: 'SP', availability: 'available',
      publicEmail: 'profissional@example.com', showEmail: true, isPublished: true
    }
  });
  assertJsonContract(published, 200);
  assert.equal(published.json.profile.isPublished, true);
  assert.equal(published.json.profile.publicEmail, 'profissional@example.com');
  assert.equal(published.json.profile.showEmail, true);

  const ownerView = await fixture.request('/api/account/professional-profile');
  assertJsonContract(ownerView, 200);
  assert.deepEqual(ownerView.json.profile, published.json.profile);

  const anonymousGet = await fixture.request('/api/account/professional-profile', { useCookie: false });
  const anonymousPut = await fixture.request('/api/account/professional-profile', {
    method: 'PUT', json: { bio: 'Sem sessao' }, useCookie: false
  });
  assertJsonContract(anonymousGet, 401);
  assertJsonContract(anonymousPut, 401);
});

test('mutacoes de conta rejeitam origem externa antes de autenticar ou persistir', async (t) => {
  const fixture = fixtureFor(t);
  const scenarios = [
    { path: '/api/account/photo', method: 'DELETE', json: {} },
    { path: '/api/account', method: 'DELETE', json: { currentPassword: 'Segura123', confirmation: 'EXCLUIR' } },
    { path: '/api/account/professional-profile', method: 'PUT', json: { bio: 'Rascunho externo' } }
  ];

  for (const scenario of scenarios) {
    const result = await fixture.request(scenario.path, {
      method: scenario.method,
      json: scenario.json,
      originHeader: 'https://site-malicioso.test',
      useCookie: false
    });
    assertJsonContract(result, 403);
  }
  assert.equal(countRows(fixture.DB, 'users'), 0);
  assert.equal(countRows(fixture.DB, 'professional_profiles'), 0);
});

test('limites de exclusao de conta e alteracao profissional retornam 429', async (t) => {
  const scenarios = [
    { path: '/api/account', method: 'DELETE', attempts: 6, json: { currentPassword: 'Segura123', confirmation: 'EXCLUIR' } },
    { path: '/api/account/professional-profile', method: 'PUT', attempts: 31, json: { bio: 'Sem sessao' } }
  ];

  for (const scenario of scenarios) {
    await t.test(scenario.path, async (subtest) => {
      const fixture = fixtureFor(subtest);
      let result;
      for (let attempt = 0; attempt < scenario.attempts; attempt += 1) {
        result = await fixture.request(scenario.path, {
          method: scenario.method, json: scenario.json, useCookie: false
        });
      }
      assertJsonContract(result, 429);
    });
  }
});

test('contratos de conta preservam 404 para metodos nao suportados', async (t) => {
  const fixture = fixtureFor(t);
  const contracts = API_CONTRACTS.filter(({ area }) => ['account', 'professional-profile'].includes(area));
  for (const contract of contracts) {
    const result = await fixture.request(contract.route.replace(':id', '1'), {
      method: 'PATCH',
      json: {},
      useCookie: false
    });
    assertJsonContract(result, 404);
  }
});

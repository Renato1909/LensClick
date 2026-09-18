import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.mjs';
import { MockD1, MockR2 } from '../test-support/worker-fixture.mjs';

test('Worker usa D1 e R2 no fluxo completo de autenticacao', async (t) => {
  const DB = new MockD1();
  const PROFILE_IMAGES = new MockR2();
  const env = { DB, PROFILE_IMAGES };
  const origin = 'https://lensclick.test';
  let cookie = '';
  t.after(() => DB.close());

  async function request(path, { method = 'GET', body, withCookie = true } = {}) {
    const response = await worker.fetch(new Request(origin + path, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json', Origin: origin } : {}),
        ...(withCookie && cookie ? { Cookie: cookie } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    }), env);
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const contentType = response.headers.get('content-type') || '';
    return { response, json: contentType.includes('json') ? await response.json() : null };
  }

  const registration = await request('/api/auth/register', {
    method: 'POST',
    body: { name: 'Pessoa Teste', email: 'PESSOA@example.com', phone: '(11) 99999-9999', password: 'Segura123' }
  });
  assert.equal(registration.response.status, 201);
  assert.equal(registration.json.user.email, 'pessoa@example.com');
  assert.match(cookie, /^lensclick_session=/);
  assert.match(registration.response.headers.get('set-cookie'), /HttpOnly; SameSite=Lax/);
  assert.match(registration.response.headers.get('set-cookie'), /Secure/);

  const storedUser = DB.prepare('SELECT * FROM users WHERE email = ?').bind('pessoa@example.com').first();
  assert.match(storedUser.password_hash, /^pbkdf2-sha256\$100000\$/);
  assert.doesNotMatch(storedUser.password_hash, /Segura123/);

  const me = await request('/api/auth/me');
  assert.equal(me.response.status, 200);
  assert.equal(me.json.user.name, 'Pessoa Teste');
  assert.equal('password_hash' in me.json.user, false);

  const onePixelPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const unconfirmedEmailChange = await request('/api/profile', {
    method: 'PUT',
    body: { ...me.json.user, email: 'novo@example.com', currentPassword: 'SenhaErrada1' }
  });
  assert.equal(unconfirmedEmailChange.response.status, 403);

  const profile = await request('/api/profile', {
    method: 'PUT',
    body: {
      ...me.json.user,
      email: 'novo@example.com',
      age: 22,
      gender: 'other',
      role: 'client',
      profilePic: onePixelPng,
      currentPassword: 'Segura123'
    }
  });
  assert.equal(profile.response.status, 200);
  assert.match(profile.json.user.profilePic, /^\/api\/profile-picture\/\d+/);
  assert.equal(PROFILE_IMAGES.objects.size, 1);

  const picture = await request(profile.json.user.profilePic);
  assert.equal(picture.response.status, 200);
  assert.equal(picture.response.headers.get('content-type'), 'image/png');

  const removedPhoto = await request('/api/account/photo', { method: 'DELETE', body: {} });
  assert.equal(removedPhoto.response.status, 200);
  assert.equal(removedPhoto.json.user.profilePic, '');
  assert.equal(PROFILE_IMAGES.objects.size, 0);

  const currentCookie = cookie;
  const otherLoginResponse = await worker.fetch(new Request(origin + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ email: 'novo@example.com', password: 'Segura123' })
  }), env);
  assert.equal(otherLoginResponse.status, 200);
  const otherCookie = otherLoginResponse.headers.get('set-cookie').split(';')[0];

  const wrongCurrentPassword = await request('/api/account/password', {
    method: 'PUT',
    body: { currentPassword: 'SenhaErrada1', newPassword: 'SenhaNova2' }
  });
  assert.equal(wrongCurrentPassword.response.status, 403);

  const reusedPassword = await request('/api/account/password', {
    method: 'PUT',
    body: { currentPassword: 'Segura123', newPassword: 'Segura123' }
  });
  assert.equal(reusedPassword.response.status, 409);

  const changedPassword = await request('/api/account/password', {
    method: 'PUT',
    body: { currentPassword: 'Segura123', newPassword: 'SenhaNova2' }
  });
  assert.equal(changedPassword.response.status, 200);

  const currentSessionStillWorks = await request('/api/auth/me');
  assert.equal(currentSessionStillWorks.response.status, 200);
  assert.equal(cookie, currentCookie);

  const otherSessionWasClosed = await worker.fetch(new Request(origin + '/api/auth/me', {
    headers: { Cookie: otherCookie }
  }), env);
  assert.equal(otherSessionWasClosed.status, 401);

  const oldPassword = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'novo@example.com', password: 'Segura123' },
    withCookie: false
  });
  assert.equal(oldPassword.response.status, 401);

  const contact = await request('/api/contact', {
    method: 'POST',
    body: { name: 'Pessoa Teste', email: 'novo@example.com', message: 'Gostaria de solicitar um orcamento.' }
  });
  assert.equal(contact.response.status, 201);

  const newsletter = await request('/api/newsletter', {
    method: 'POST',
    body: { email: 'novo@example.com' }
  });
  assert.equal(newsletter.response.status, 201);

  const logout = await request('/api/auth/logout', { method: 'POST', body: {} });
  assert.equal(logout.response.status, 200);
  const unauthorized = await request('/api/auth/me');
  assert.equal(unauthorized.response.status, 401);

  const login = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'novo@example.com', password: 'SenhaNova2' },
    withCookie: false
  });
  assert.equal(login.response.status, 200);
});

test('Worker rejeita mutacoes de outra origem e senhas invalidas', async (t) => {
  const DB = new MockD1();
  t.after(() => DB.close());
  const env = { DB, PROFILE_IMAGES: new MockR2() };
  const payload = JSON.stringify({ name: 'Pessoa Teste', email: 'pessoa@example.com', phone: '11999999999', password: 'fraca' });

  const foreignOrigin = await worker.fetch(new Request('https://lensclick.test/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://site-malicioso.test' },
    body: payload
  }), env);
  assert.equal(foreignOrigin.status, 403);

  const weakPassword = await worker.fetch(new Request('https://lensclick.test/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://lensclick.test' },
    body: payload
  }), env);
  assert.equal(weakPassword.status, 400);

  const anonymousPhotoRemoval = await worker.fetch(new Request('https://lensclick.test/api/account/photo', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Origin: 'https://lensclick.test' },
    body: '{}'
  }), env);
  assert.equal(anonymousPhotoRemoval.status, 401);
});

test('perfil profissional respeita publicacao, privacidade e mudanca de papel', async (t) => {
  const DB = new MockD1();
  const PROFILE_IMAGES = new MockR2();
  const env = { DB, PROFILE_IMAGES };
  const origin = 'https://lensclick.test';
  let cookie = '';
  t.after(() => DB.close());

  async function request(path, { method = 'GET', body, withCookie = true } = {}) {
    const response = await worker.fetch(new Request(origin + path, {
      method,
      headers: {
        ...(body ? { Origin: origin, 'Content-Type': 'application/json' } : {}),
        ...(withCookie && cookie ? { Cookie: cookie } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    }), env);
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const type = response.headers.get('content-type') || '';
    return { response, json: type.includes('json') ? await response.json() : null };
  }

  const registration = await request('/api/auth/register', {
    method: 'POST',
    body: { name: 'Clara Luz', email: 'clara@example.com', phone: '11988887777', password: 'Clara123' }
  });
  assert.equal(registration.response.status, 201);

  const clientPublish = await request('/api/account/professional-profile', {
    method: 'PUT', body: { bio: 'Uma apresentação profissional completa para publicar na plataforma LensClick.', isPublished: true }
  });
  assert.equal(clientPublish.response.status, 403);

  const onePixelPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const photographerAccount = await request('/api/profile', {
    method: 'PUT',
    body: { ...registration.json.user, role: 'photographer', age: 31, gender: 'female', profilePic: onePixelPng }
  });
  assert.equal(photographerAccount.response.status, 200);

  const draft = await request('/api/account/professional-profile', {
    method: 'PUT',
    body: { bio: 'Rascunho breve', specialties: [], city: '', state: '', availability: 'available', isPublished: false }
  });
  assert.equal(draft.response.status, 200);
  assert.equal(draft.json.profile.isPublished, false);
  assert.match(draft.json.profile.slug, /^clara-luz-\d+$/);

  const hiddenDraft = await request(`/api/photographers/${draft.json.profile.slug}`, { withCookie: false });
  assert.equal(hiddenDraft.response.status, 404);

  const incompletePublish = await request('/api/account/professional-profile', {
    method: 'PUT',
    body: { ...draft.json.profile, isPublished: true }
  });
  assert.equal(incompletePublish.response.status, 400);

  const published = await request('/api/account/professional-profile', {
    method: 'PUT',
    body: {
      bio: 'Fotografo histórias com direção leve, atenção aos detalhes e uma entrega pensada para cada cliente.',
      specialties: ['wedding', 'portrait', 'unknown'],
      city: 'Campinas', state: 'sp', serviceRadiusKm: 120, startingPriceCents: 180000,
      availability: 'limited', publicEmail: 'contato@claraluz.com.br', publicPhone: '(19) 99999-0000',
      instagram: '@claraluz.foto', website: 'https://claraluz.example/', showEmail: false, showPhone: true,
      isPublished: true
    }
  });
  assert.equal(published.response.status, 200);
  assert.deepEqual(published.json.profile.specialties, ['wedding', 'portrait']);
  assert.equal(published.json.profile.isPublished, true);

  const publicResult = await request(`/api/photographers/${published.json.profile.slug}`, { withCookie: false });
  assert.equal(publicResult.response.status, 200);
  assert.equal(publicResult.json.profile.name, 'Clara Luz');
  assert.equal(publicResult.json.profile.contacts.email, '');
  assert.equal(publicResult.json.profile.contacts.phone, '(19) 99999-0000');
  assert.equal('publicEmail' in publicResult.json.profile, false);
  assert.equal('showEmail' in publicResult.json.profile, false);
  assert.match(publicResult.json.profile.profilePic, /^\/api\/photographers\/clara-luz-\d+\/photo/);

  const publicPhoto = await request(`/api/photographers/${published.json.profile.slug}/photo`, { withCookie: false });
  assert.equal(publicPhoto.response.status, 200);
  assert.match(publicPhoto.response.headers.get('cache-control'), /public/);

  const portfolioForm = new FormData();
  portfolioForm.append('image', new Blob([Buffer.from(onePixelPng.split(',')[1], 'base64')], { type: 'image/png' }), 'ensaio.png');
  portfolioForm.append('altText', 'Casal caminhando ao pôr do sol');
  portfolioForm.append('caption', 'Ensaio ao entardecer');
  const portfolioUploadResponse = await worker.fetch(new Request(origin + '/api/account/portfolio', {
    method: 'POST', headers: { Origin: origin, Cookie: cookie }, body: portfolioForm
  }), env);
  assert.equal(portfolioUploadResponse.status, 201);
  const portfolioUpload = await portfolioUploadResponse.json();
  assert.match(portfolioUpload.item.imageUrl, /^\/api\/account\/portfolio\/\d+\/image/);

  const ownerPortfolio = await request('/api/account/portfolio');
  assert.equal(ownerPortfolio.response.status, 200);
  assert.equal(ownerPortfolio.json.portfolio.length, 1);
  const savedPortfolio = await request('/api/account/portfolio', {
    method: 'PUT', body: { items: [{ id: portfolioUpload.item.id, altText: 'Casal em silhueta ao pôr do sol', caption: 'Luz de fim de tarde' }] }
  });
  assert.equal(savedPortfolio.response.status, 200);
  assert.equal(savedPortfolio.json.portfolio[0].caption, 'Luz de fim de tarde');

  const publicWithPortfolio = await request(`/api/photographers/${published.json.profile.slug}`, { withCookie: false });
  assert.equal(publicWithPortfolio.json.profile.portfolio.length, 1);
  assert.equal(publicWithPortfolio.json.profile.portfolio[0].altText, 'Casal em silhueta ao pôr do sol');
  assert.equal('object_key' in publicWithPortfolio.json.profile.portfolio[0], false);
  const publicPortfolioImage = await request(publicWithPortfolio.json.profile.portfolio[0].imageUrl.split('?')[0], { withCookie: false });
  assert.equal(publicPortfolioImage.response.status, 200);
  assert.match(publicPortfolioImage.response.headers.get('cache-control'), /public/);

  const removedPortfolio = await request(`/api/account/portfolio/${portfolioUpload.item.id}`, { method: 'DELETE', body: {} });
  assert.equal(removedPortfolio.response.status, 200);
  assert.equal((await request('/api/account/portfolio')).json.portfolio.length, 0);

  const removedRequiredPhoto = await request('/api/account/photo', { method: 'DELETE', body: {} });
  assert.equal(removedRequiredPhoto.response.status, 200);
  const hiddenWithoutPhoto = await request(`/api/photographers/${published.json.profile.slug}`, { withCookie: false });
  assert.equal(hiddenWithoutPhoto.response.status, 404);

  const clientAgain = await request('/api/profile', {
    method: 'PUT',
    body: { ...photographerAccount.json.user, role: 'client', profilePic: photographerAccount.json.user.profilePic }
  });
  assert.equal(clientAgain.response.status, 200);
  const unpublished = await request(`/api/photographers/${published.json.profile.slug}`, { withCookie: false });
  assert.equal(unpublished.response.status, 404);
});

test('exclusao remove dados controlados pela conta sem apagar registros independentes', async (t) => {
  const DB = new MockD1();
  const PROFILE_IMAGES = new MockR2();
  const env = { DB, PROFILE_IMAGES };
  const origin = 'https://lensclick.test';
  let cookie = '';
  t.after(() => DB.close());

  async function request(path, method, body, withCookie = true) {
    const response = await worker.fetch(new Request(origin + path, {
      method,
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        ...(withCookie && cookie ? { Cookie: cookie } : {})
      },
      body: JSON.stringify(body)
    }), env);
    const setCookie = response.headers.get('set-cookie');
    if (setCookie && !setCookie.includes('Max-Age=0')) cookie = setCookie.split(';')[0];
    return { response, json: await response.json() };
  }

  const registration = await request('/api/auth/register', 'POST', {
    name: 'Titular Exclusao',
    email: 'excluir@example.com',
    phone: '11999999999',
    password: 'Excluir123'
  }, false);
  assert.equal(registration.response.status, 201);
  const primaryCookie = cookie;
  const primaryId = registration.json.user.id;

  const otherRegistration = await worker.fetch(new Request(origin + '/api/auth/register', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': '198.51.100.20' },
    body: JSON.stringify({ name: 'Outra Pessoa', email: 'outra@example.com', phone: '11888888888', password: 'OutraSenha1' })
  }), env);
  assert.equal(otherRegistration.status, 201);

  const onePixelPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const profile = await request('/api/profile', 'PUT', {
    name: 'Titular Exclusao',
    email: 'excluir@example.com',
    phone: '11999999999',
    role: 'client',
    age: 30,
    gender: 'other',
    profilePic: onePixelPng
  });
  assert.equal(profile.response.status, 200);
  assert.equal(PROFILE_IMAGES.objects.size, 1);

  assert.equal((await request('/api/contact', 'POST', {
    name: 'Titular Exclusao', email: 'excluir@example.com', message: 'Registro independente que deve permanecer.'
  })).response.status, 201);
  assert.equal((await request('/api/newsletter', 'POST', { email: 'excluir@example.com' })).response.status, 201);
  assert.equal((await request('/api/contact', 'POST', {
    name: 'Outra Pessoa', email: 'outra@example.com', message: 'Mensagem que deve permanecer.'
  })).response.status, 201);
  assert.equal((await request('/api/newsletter', 'POST', { email: 'outra@example.com' })).response.status, 201);
  DB.prepare('INSERT INTO password_reset_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .bind('token-hash-deletion-test', primaryId, Date.now() + 60_000).run();

  const anonymousDeletion = await request('/api/account', 'DELETE', {
    currentPassword: 'Excluir123', confirmation: 'EXCLUIR'
  }, false);
  assert.equal(anonymousDeletion.response.status, 401);

  const wrongPhrase = await request('/api/account', 'DELETE', {
    currentPassword: 'Excluir123', confirmation: 'CONFIRMAR'
  });
  assert.equal(wrongPhrase.response.status, 400);

  const wrongPassword = await request('/api/account', 'DELETE', {
    currentPassword: 'SenhaErrada1', confirmation: 'EXCLUIR'
  });
  assert.equal(wrongPassword.response.status, 403);

  const deletion = await request('/api/account', 'DELETE', {
    currentPassword: 'Excluir123', confirmation: 'DELETE'
  });
  assert.equal(deletion.response.status, 200);
  assert.match(deletion.response.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal(PROFILE_IMAGES.objects.size, 0);

  assert.equal(DB.prepare('SELECT COUNT(*) AS count FROM users WHERE id = ?').bind(primaryId).first('count'), 0);
  assert.equal(DB.prepare('SELECT COUNT(*) AS count FROM sessions WHERE user_id = ?').bind(primaryId).first('count'), 0);
  assert.equal(DB.prepare('SELECT COUNT(*) AS count FROM password_reset_tokens WHERE user_id = ?').bind(primaryId).first('count'), 0);
  assert.equal(DB.prepare('SELECT COUNT(*) AS count FROM contact_messages WHERE email = ?').bind('excluir@example.com').first('count'), 1);
  assert.equal(DB.prepare('SELECT COUNT(*) AS count FROM newsletter_subscriptions WHERE email = ?').bind('excluir@example.com').first('count'), 1);
  assert.equal(DB.prepare('SELECT COUNT(*) AS count FROM users WHERE email = ?').bind('outra@example.com').first('count'), 1);
  assert.equal(DB.prepare('SELECT COUNT(*) AS count FROM contact_messages WHERE email = ?').bind('outra@example.com').first('count'), 1);
  assert.equal(DB.prepare('SELECT COUNT(*) AS count FROM newsletter_subscriptions WHERE email = ?').bind('outra@example.com').first('count'), 1);

  const oldSession = await worker.fetch(new Request(origin + '/api/auth/me', { headers: { Cookie: primaryCookie } }), env);
  assert.equal(oldSession.status, 401);
  const oldLogin = await request('/api/auth/login', 'POST', { email: 'excluir@example.com', password: 'Excluir123' }, false);
  assert.equal(oldLogin.response.status, 401);
});

test('recuperacao troca a senha sem revelar contas e invalida sessoes', async (t) => {
  const DB = new MockD1();
  const sentEmails = [];
  const env = {
    DB,
    PROFILE_IMAGES: new MockR2(),
    BREVO_API_KEY: 'brevo_test_only',
    BREVO_SENDER_EMAIL: 'conta@lensclick.test',
    BREVO_SENDER_NAME: 'LensClick',
    BREVO_FETCH: async (url, options) => {
      assert.equal(url, 'https://api.brevo.com/v3/smtp/email');
      assert.equal(options.headers['api-key'], 'brevo_test_only');
      sentEmails.push(JSON.parse(options.body));
      return Response.json({ messageId: 'email-test' });
    }
  };
  const origin = 'https://lensclick.test';
  let cookie = '';
  t.after(() => DB.close());

  async function request(path, body, withCookie = true) {
    const response = await worker.fetch(new Request(origin + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: origin,
        ...(withCookie && cookie ? { Cookie: cookie } : {})
      },
      body: JSON.stringify(body)
    }), env);
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    return { response, json: await response.json() };
  }

  const registration = await request('/api/auth/register', {
    name: 'Conta Recuperavel',
    email: 'recuperar@example.com',
    phone: '11999999999',
    password: 'SenhaAntiga1'
  });
  assert.equal(registration.response.status, 201);
  const originalCookie = cookie;

  const known = await request('/api/auth/password-reset/request', { email: 'recuperar@example.com' }, false);
  const unknown = await request('/api/auth/password-reset/request', { email: 'inexistente@example.com' }, false);
  assert.equal(known.response.status, 202);
  assert.equal(unknown.response.status, 202);
  assert.deepEqual(known.json, unknown.json);
  assert.equal(sentEmails.length, 2);

  assert.deepEqual(sentEmails[1].sender, { name: 'LensClick', email: 'conta@lensclick.test' });
  assert.equal(sentEmails[1].to[0].email, 'recuperar@example.com');
  const resetLink = sentEmails[1].textContent.match(/https:\/\/\S+/)?.[0];
  assert.ok(resetLink);
  const token = new URL(resetLink).searchParams.get('token');
  assert.match(token, /^[A-Za-z0-9_-]{40,100}$/);
  const storedToken = DB.prepare('SELECT token_hash FROM password_reset_tokens').first('token_hash');
  assert.notEqual(storedToken, token);

  const reset = await request('/api/auth/password-reset/confirm', { token, password: 'SenhaNova2' }, false);
  assert.equal(reset.response.status, 200);

  const oldSession = await worker.fetch(new Request(origin + '/api/auth/me', {
    headers: { Cookie: originalCookie }
  }), env);
  assert.equal(oldSession.status, 401);

  const oldPassword = await request('/api/auth/login', { email: 'recuperar@example.com', password: 'SenhaAntiga1' }, false);
  assert.equal(oldPassword.response.status, 401);
  const newPassword = await request('/api/auth/login', { email: 'recuperar@example.com', password: 'SenhaNova2' }, false);
  assert.equal(newPassword.response.status, 200);

  const reused = await request('/api/auth/password-reset/confirm', { token, password: 'OutraSenha3' }, false);
  assert.equal(reused.response.status, 400);
});

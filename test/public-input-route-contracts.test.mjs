import test from 'node:test';
import assert from 'node:assert/strict';
import { API_CONTRACTS } from '../test-support/api-contracts.mjs';
import { createWorkerFixture } from '../test-support/worker-fixture.mjs';

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

function countRows(DB, table) {
  return Number(DB.prepare(`SELECT COUNT(*) AS total FROM ${table}`).first('total'));
}

test('manifesto final fecha 32 rotas e 37 contratos sem duplicatas', () => {
  assert.equal(API_CONTRACTS.length, 37);
  assert.equal(new Set(API_CONTRACTS.map(({ method, route }) => `${method} ${route}`)).size, 37);
  assert.equal(new Set(API_CONTRACTS.map(({ route }) => route)).size, 32);
  assert.deepEqual(
    [...new Set(API_CONTRACTS.map(({ area }) => area))].sort(),
    ['account', 'auth', 'discovery', 'messaging', 'operations', 'portfolio', 'professional-profile', 'public-input', 'reputation']
  );
  assert.deepEqual(
    API_CONTRACTS.filter(({ area }) => area === 'public-input').map(({ method, route }) => `${method} ${route}`),
    ['POST /api/contact', 'POST /api/newsletter']
  );
});

test('POST /api/contact normaliza e persiste somente os campos do contrato', async (t) => {
  const fixture = fixtureFor(t);
  const created = await fixture.request('/api/contact', {
    method: 'POST',
    json: {
      name: '  Pessoa Interessada  ',
      email: 'PESSOA@EXAMPLE.COM',
      phone: ' (11) 99999-9999 ',
      serviceType: ' wedding ',
      eventDate: ' 2027-05-10 ',
      message: '  Gostaria de conversar sobre um orçamento para o evento.  ',
      ignored: 'este campo nao deve ser persistido'
    },
    useCookie: false
  });
  assertJsonContract(created, 201);
  assert.equal(countRows(fixture.DB, 'contact_messages'), 1);
  const stored = fixture.DB.prepare('SELECT * FROM contact_messages').first();
  assert.equal(stored.name, 'Pessoa Interessada');
  assert.equal(stored.email, 'pessoa@example.com');
  assert.equal(stored.phone, '(11) 99999-9999');
  assert.equal(stored.service_type, 'wedding');
  assert.equal(stored.event_date, '2027-05-10');
  assert.equal(stored.message, 'Gostaria de conversar sobre um orçamento para o evento.');
  assert.equal('ignored' in stored, false);
});

test('POST /api/contact rejeita entradas inválidas sem criar mensagens', async (t) => {
  const fixture = fixtureFor(t);
  const invalidPayloads = [
    { name: 'A', email: 'pessoa@example.com', message: 'Mensagem suficientemente longa.' },
    { name: 'Pessoa', email: 'invalido', message: 'Mensagem suficientemente longa.' },
    { name: 'Pessoa', email: 'pessoa@example.com', message: 'curta' }
  ];
  for (const json of invalidPayloads) {
    assertJsonContract(await fixture.request('/api/contact', {
      method: 'POST', json, useCookie: false
    }), 400);
  }

  const malformed = await fixture.request('/api/contact', {
    method: 'POST', body: '{', headers: { 'Content-Type': 'application/json' }, useCookie: false
  });
  const unsupportedMedia = await fixture.request('/api/contact', {
    method: 'POST', body: 'name=Pessoa', headers: { 'Content-Type': 'text/plain' }, useCookie: false
  });
  const oversized = await fixture.request('/api/contact', {
    method: 'POST',
    body: JSON.stringify({ message: 'x'.repeat(700_001) }),
    headers: { 'Content-Type': 'application/json' },
    useCookie: false
  });
  const foreignOrigin = await fixture.request('/api/contact', {
    method: 'POST',
    json: { name: 'Pessoa', email: 'pessoa@example.com', message: 'Mensagem suficientemente longa.' },
    originHeader: 'https://site-malicioso.test',
    useCookie: false
  });
  assertJsonContract(malformed, 400);
  assertJsonContract(unsupportedMedia, 415);
  assertJsonContract(oversized, 413);
  assertJsonContract(foreignOrigin, 403);
  assert.equal(countRows(fixture.DB, 'contact_messages'), 0);
});

test('POST /api/contact aplica rate limiting antes da validação e persistência', async (t) => {
  const fixture = fixtureFor(t);
  let result;
  for (let attempt = 0; attempt < 21; attempt += 1) {
    result = await fixture.request('/api/contact', {
      method: 'POST', json: { name: '', email: '', message: '' }, useCookie: false
    });
  }
  assertJsonContract(result, 429);
  assert.equal(countRows(fixture.DB, 'contact_messages'), 0);
});

test('POST /api/newsletter normaliza e torna inscrição duplicada idempotente', async (t) => {
  const fixture = fixtureFor(t);
  const first = await fixture.request('/api/newsletter', {
    method: 'POST', json: { email: ' PESSOA@EXAMPLE.COM ' }, useCookie: false
  });
  const duplicate = await fixture.request('/api/newsletter', {
    method: 'POST', json: { email: 'pessoa@example.com' }, useCookie: false
  });
  assertJsonContract(first, 201);
  assertJsonContract(duplicate, 201);
  assert.deepEqual(first.json, duplicate.json);
  assert.equal(countRows(fixture.DB, 'newsletter_subscriptions'), 1);
  assert.equal(fixture.DB.prepare('SELECT email FROM newsletter_subscriptions').first('email'), 'pessoa@example.com');
});

test('POST /api/newsletter rejeita formato, origem e e-mail inválidos sem persistir', async (t) => {
  const fixture = fixtureFor(t);
  const invalid = await fixture.request('/api/newsletter', {
    method: 'POST', json: { email: 'invalido' }, useCookie: false
  });
  const malformed = await fixture.request('/api/newsletter', {
    method: 'POST', body: '{', headers: { 'Content-Type': 'application/json' }, useCookie: false
  });
  const unsupportedMedia = await fixture.request('/api/newsletter', {
    method: 'POST', body: 'email=pessoa@example.com', headers: { 'Content-Type': 'text/plain' }, useCookie: false
  });
  const foreignOrigin = await fixture.request('/api/newsletter', {
    method: 'POST', json: { email: 'pessoa@example.com' }, originHeader: 'https://site-malicioso.test', useCookie: false
  });
  assertJsonContract(invalid, 400);
  assertJsonContract(malformed, 400);
  assertJsonContract(unsupportedMedia, 415);
  assertJsonContract(foreignOrigin, 403);
  assert.equal(countRows(fixture.DB, 'newsletter_subscriptions'), 0);
});

test('POST /api/newsletter aplica rate limiting sem criar inscrição inválida', async (t) => {
  const fixture = fixtureFor(t);
  let result;
  for (let attempt = 0; attempt < 21; attempt += 1) {
    result = await fixture.request('/api/newsletter', {
      method: 'POST', json: { email: 'invalido' }, useCookie: false
    });
  }
  assertJsonContract(result, 429);
  assert.equal(countRows(fixture.DB, 'newsletter_subscriptions'), 0);
});

test('endpoint desconhecido mantém contrato 404 e observabilidade sem dados da URL', async (t) => {
  const fixture = fixtureFor(t);
  const secretCanary = 'SEGREDO-NA-URL';
  const getResult = await fixture.request(`/api/unknown?token=${secretCanary}`, { useCookie: false });
  const postResult = await fixture.request(`/api/unknown?token=${secretCanary}`, {
    method: 'POST', json: { value: secretCanary }, useCookie: false
  });
  const missingOrigin = await fixture.request('/api/unknown', {
    method: 'POST', json: {}, originHeader: null, useCookie: false
  });
  assertJsonContract(getResult, 404);
  assertJsonContract(postResult, 404);
  assertJsonContract(missingOrigin, 403);
  assert.deepEqual(getResult.json, { error: 'Endpoint nao encontrado.' });

  const completed = fixture.observabilityEvents
    .filter(({ event }) => event.event === 'http.request.completed')
    .map(({ event }) => event);
  assert.equal(completed.length, 3);
  assert.ok(completed.every(({ route }) => route === '/api/unknown'));
  assert.equal(JSON.stringify(fixture.observabilityEvents).includes(secretCanary), false);
});

test('rotas públicas de entrada preservam 404 para métodos não suportados', async (t) => {
  const fixture = fixtureFor(t);
  for (const route of ['/api/contact', '/api/newsletter']) {
    const result = await fixture.request(route, { method: 'PATCH', json: {}, useCookie: false });
    assertJsonContract(result, 404);
  }
  assert.equal(countRows(fixture.DB, 'contact_messages'), 0);
  assert.equal(countRows(fixture.DB, 'newsletter_subscriptions'), 0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWorkerFixture } from '../test-support/worker-fixture.mjs';

class MockRateLimiter {
  constructor(handler) {
    this.handler = handler;
    this.calls = [];
  }

  async limit(options) {
    this.calls.push(options);
    return this.handler(options, this.calls.length);
  }
}

function countRows(DB, table) {
  return Number(DB.prepare(`SELECT COUNT(*) AS total FROM ${table}`).first('total'));
}

function fixtureFor(t, env) {
  const fixture = createWorkerFixture({ env });
  t.after(() => fixture.close());
  return fixture;
}

test('Wrangler declara quatro limites nativos com namespaces exclusivos e janelas suportadas', () => {
  const config = JSON.parse(readFileSync('wrangler.jsonc', 'utf8'));
  assert.deepEqual(
    config.ratelimits.map(({ name, simple }) => ({ name, ...simple })),
    [
      { name: 'AUTH_RATE_LIMITER', limit: 10, period: 60 },
      { name: 'SENSITIVE_RATE_LIMITER', limit: 5, period: 60 },
      { name: 'CONTENT_RATE_LIMITER', limit: 20, period: 60 },
      { name: 'ACCOUNT_RATE_LIMITER', limit: 30, period: 60 }
    ]
  );
  assert.equal(new Set(config.ratelimits.map(({ namespace_id: id }) => id)).size, 4);
  assert.ok(config.ratelimits.every(({ namespace_id: id }) => /^\d+$/.test(id) && Number(id) > 0));
});

test('limite nativo bloqueia a rajada antes de escrever o contador no D1', async (t) => {
  const limiter = new MockRateLimiter(async () => ({ success: false }));
  const fixture = fixtureFor(t, { AUTH_RATE_LIMITER: limiter });
  const result = await fixture.request('/api/auth/register', {
    method: 'POST',
    json: {},
    headers: { 'CF-Connecting-IP': '203.0.113.20' },
    useCookie: false
  });

  assert.equal(result.response.status, 429);
  assert.equal(countRows(fixture.DB, 'rate_limits'), 0);
  assert.equal(limiter.calls.length, 1);
  assert.match(limiter.calls[0].key, /^[a-f0-9]{64}$/);
  assert.equal(limiter.calls[0].key.includes('203.0.113.20'), false);
});

test('limite nativo aprovado preserva a politica de janela longa no D1', async (t) => {
  const limiter = new MockRateLimiter(async () => ({ success: true }));
  const fixture = fixtureFor(t, { AUTH_RATE_LIMITER: limiter });
  let result;

  for (let attempt = 0; attempt < 9; attempt += 1) {
    result = await fixture.request('/api/auth/register', {
      method: 'POST',
      json: {},
      headers: { 'CF-Connecting-IP': '203.0.113.21' },
      useCookie: false
    });
  }

  assert.equal(result.response.status, 429);
  assert.equal(limiter.calls.length, 9);
  assert.equal(countRows(fixture.DB, 'rate_limits'), 1);
});

test('falha do binding nativo degrada com seguranca para o limite existente no D1', async (t) => {
  const limiter = new MockRateLimiter(async () => {
    throw new Error('indisponibilidade simulada do binding');
  });
  const fixture = fixtureFor(t, { AUTH_RATE_LIMITER: limiter });
  let result;

  for (let attempt = 0; attempt < 9; attempt += 1) {
    result = await fixture.request('/api/auth/register', {
      method: 'POST',
      json: {},
      headers: { 'CF-Connecting-IP': '203.0.113.22' },
      useCookie: false
    });
  }

  assert.equal(result.response.status, 429);
  assert.equal(limiter.calls.length, 9);
  assert.equal(countRows(fixture.DB, 'rate_limits'), 1);
});

test('rotas diferentes usam chaves opacas e isoladas no mesmo namespace', async (t) => {
  const limiter = new MockRateLimiter(async () => ({ success: true }));
  const fixture = fixtureFor(t, { AUTH_RATE_LIMITER: limiter });
  const headers = { 'CF-Connecting-IP': '203.0.113.23' };

  await fixture.request('/api/auth/register', { method: 'POST', json: {}, headers, useCookie: false });
  await fixture.request('/api/auth/login', { method: 'POST', json: {}, headers, useCookie: false });

  assert.equal(limiter.calls.length, 2);
  assert.notEqual(limiter.calls[0].key, limiter.calls[1].key);
  assert.ok(limiter.calls.every(({ key }) => /^[a-f0-9]{64}$/.test(key)));
});

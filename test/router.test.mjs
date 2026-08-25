import test from 'node:test';
import assert from 'node:assert/strict';

import { API_CONTRACTS } from '../test-support/api-contracts.mjs';
import { createRequestRouter, matchApiRoute } from '../src/router.mjs';

function concretePath(route) {
  return route.replace(':slug', 'fotografa-1').replace(':id', '42');
}

test('o roteador declara todos os contratos HTTP catalogados', () => {
  const routeIds = [];
  for (const contract of API_CONTRACTS) {
    const match = matchApiRoute(concretePath(contract.route), contract.method);
    assert.ok(match, `${contract.method} ${contract.route}`);
    routeIds.push(match.id);
  }

  assert.equal(new Set(routeIds).size, API_CONTRACTS.length);
  assert.equal(matchApiRoute('/api/unknown', 'GET'), null);
  assert.equal(matchApiRoute('/api/auth/me', 'POST'), null);
  assert.equal(matchApiRoute('/api/photographers/x', 'GET'), null);
  assert.equal(matchApiRoute('/api/account/portfolio/not-a-number', 'DELETE'), null);
});

test('rotas dinamicas preservam precedencia e parametros', () => {
  assert.deepEqual(matchApiRoute('/api/photographers/fotografa-1/photo', 'GET'), {
    id: 'photographers.photo',
    params: ['fotografa-1']
  });
  assert.deepEqual(matchApiRoute('/api/photographers/fotografa-1/portfolio/42', 'GET'), {
    id: 'photographers.portfolio-image',
    params: ['fotografa-1', '42']
  });
  assert.deepEqual(matchApiRoute('/api/account/portfolio/42/image', 'GET'), {
    id: 'account.portfolio.image',
    params: ['42']
  });
});

test('o roteador separa API e assets sem alterar a politica de origem', async () => {
  const dispatched = [];
  const router = createRequestRouter({
    dispatchApiRoute: async (id, params) => {
      dispatched.push({ id, params });
      return new Response('api', { status: 200 });
    },
    handleAssetRequest: async () => new Response('asset', { status: 200 }),
    requestOriginIsAllowed: (request) => request.headers.get('Origin') === new URL(request.url).origin,
    forbiddenResponse: () => new Response('forbidden', { status: 403 }),
    notFoundResponse: () => new Response('missing', { status: 404 })
  });

  const api = await router.handleRequest(new Request('https://lensclick.test/api/photographers/fotografa-1'));
  assert.equal(api.status, 200);
  assert.deepEqual(dispatched, [{ id: 'photographers.detail', params: ['fotografa-1'] }]);

  const forbidden = await router.handleRequest(new Request('https://lensclick.test/api/unknown', { method: 'PATCH' }));
  assert.equal(forbidden.status, 403);

  const missing = await router.handleRequest(new Request('https://lensclick.test/api/unknown'));
  assert.equal(missing.status, 404);

  const asset = await router.handleRequest(new Request('https://lensclick.test/index.html'));
  assert.equal(asset.status, 200);
  assert.equal(await asset.text(), 'asset');
});

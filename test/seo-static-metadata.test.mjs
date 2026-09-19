import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.mjs';

test('paginas publicas estaticas recebem metadados sociais e JSON-LD', async () => {
  const html = '<!doctype html><html><head><title>Busca de fotógrafos | LensClick</title><meta name="description" content="Encontre fotógrafos."></head><body></body></html>';
  const env = {
    ASSETS: { fetch: async () => new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=UTF-8' } }) }
  };
  const response = await worker.fetch(new Request('https://lensclick.test/busca.html'), env);
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.match(body, /rel="canonical"/);
  assert.match(body, /property="og:title"/);
  assert.match(body, /property="og:description"/);
  assert.match(body, /application/ld+json/);
  assert.match(body, /"@type":"WebSite"/);
  assert.match(body, /"@type":"Organization"/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.mjs';
import { normalizeRoute } from '../src/observability.mjs';
import { readFileSync } from 'node:fs';

function environment(rows = []) {
  return {
    DB: { prepare: () => ({ all: async () => ({ results: rows }) }) },
    ASSETS: { fetch: async () => new Response('asset') }
  };
}

test('sitemap lista a pagina inicial, busca e somente perfis publicados', async () => {
  const response = await worker.fetch(
    new Request('https://lensclick.example/sitemap.xml'),
    environment([
      { slug: 'ana-luz', updated_at: '2026-08-31 12:00:00' },
      { slug: 'joao-fotografo', updated_at: '2026-08-30 09:10:00' }
    ]),
    {}
  );
  const xml = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^application\/xml/);
  assert.match(response.headers.get('cache-control'), /max-age=3600/);
  assert.match(xml, /<loc>https:\/\/lensclick\.example\/fotografo\/ana-luz<\/loc>/);
  assert.match(xml, /<lastmod>2026-08-31T12:00:00Z<\/lastmod>/);
  assert.match(xml, /<loc>https:\/\/lensclick\.example\/fotografo\/joao-fotografo<\/loc>/);
  assert.doesNotMatch(xml, /perfil\.html|\/api\//);
  assert.equal(normalizeRoute('https://lensclick.example/sitemap.xml'), '/sitemap.xml');
  assert.match(readFileSync('src/worker.mjs', 'utf8'), /SELECT p\.slug, p\.updated_at AS updated_at FROM professional_profiles p/);
});

test('robots.txt permite paginas publicas, bloqueia areas privadas e aponta para sitemap', async () => {
  const response = await worker.fetch(
    new Request('https://lensclick.example/robots.txt'),
    environment(),
    {}
  );
  const robots = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^text\/plain/);
  assert.match(robots, /User-agent: \*/);
  assert.match(robots, /Allow: \//);
  assert.match(robots, /Disallow: \/api\//);
  assert.match(robots, /Disallow: \/perfil/);
  assert.match(robots, /Sitemap: https:\/\/lensclick\.example\/sitemap\.xml/);
  assert.equal(normalizeRoute('https://lensclick.example/robots.txt'), '/robots.txt');
});

test('sitemap e robots respondem HEAD sem transferir corpo', async () => {
  const sitemap = await worker.fetch(new Request('https://lensclick.example/sitemap.xml', { method: 'HEAD' }), environment(), {});
  const robots = await worker.fetch(new Request('https://lensclick.example/robots.txt', { method: 'HEAD' }), environment(), {});
  assert.equal(sitemap.status, 200);
  assert.equal(robots.status, 200);
  assert.equal(await sitemap.text(), '');
  assert.equal(await robots.text(), '');
});

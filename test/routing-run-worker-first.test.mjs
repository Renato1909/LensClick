import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { STATIC_PAGES } from '../src/worker.mjs';

const read = (file) => readFileSync(resolve(file), 'utf8');

// O Cloudflare Assets serve `/busca` a partir de `busca.html` e responde 307
// para `/busca.html`. O que decide se a requisicao chega ao Worker — e portanto
// se os metadados sao emitidos — e `run_worker_first`, em `wrangler.jsonc`.
//
// Se uma URL limpa faltar la, a pagina e servida direto pelos Assets: sem
// canonical, sem Open Graph, sem JSON-LD e sem `X-Robots-Tag`. Foi
// exatamente o que aconteceu com as paginas publicas antes desta PR.
function runWorkerFirst() {
  const config = read('wrangler.jsonc')
    .replace(/\/\/.*$/gm, '')
    .replace(/,(\s*[}\]])/g, '$1');
  const block = config.match(/"run_worker_first"\s*:\s*\[([^\]]*)\]/);
  assert.ok(block, 'run_worker_first nao encontrado em wrangler.jsonc');
  return [...block[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

test('toda pagina estatica com politica e atendida primeiro pelo Worker', () => {
  const patterns = runWorkerFirst();

  for (const path of STATIC_PAGES.keys()) {
    assert.ok(
      patterns.includes(path),
      `a pagina ${path} nao esta em run_worker_first: sera servida direto pelos Assets, sem metadados`
    );
  }
});

test('as variantes .html tambem passam pelo Worker para responder 301', () => {
  const patterns = runWorkerFirst();
  assert.ok(patterns.includes('/*.html'), 'a variante .html precisa passar pelo Worker');
});

test('o sitemap aponta para as URLs limpas que sao de fato servidas', () => {
  const worker = read('src/worker.mjs');
  for (const path of ['/busca', '/termos', '/privacidade']) {
    assert.match(worker, new RegExp(`new URL\\('${path}', url\\)`), path);
  }
  assert.doesNotMatch(worker, /new URL\('\/busca\.html', url\)/);
  assert.doesNotMatch(worker, /new URL\('\/termos\.html', url\)/);
  assert.doesNotMatch(worker, /new URL\('\/privacidade\.html', url\)/);
});

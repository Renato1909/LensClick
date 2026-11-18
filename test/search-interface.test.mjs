import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readCatalogs } from '../test-utils/i18n.mjs';

const read = (file) => readFileSync(file, 'utf8');

test('a busca avançada expõe preço, raio, ordenação e limpeza em uma interface bilíngue', () => {
  const html = read('public/busca.html');
  const script = read('public/search.js');
  const translations = readCatalogs();

  for (const id of ['filterMinPrice', 'filterMaxPrice', 'filterMinRadius', 'filterSort', 'clearFilters']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
    assert.match(script, new RegExp(`getElementById\\(["']${id}["']\\)`));
  }

  for (const parameter of ['minPrice', 'maxPrice', 'minRadius', 'sort']) {
    assert.match(script, new RegExp(`params\\.set\\(["']${parameter}["']`));
  }

  assert.match(script, /clearFiltersBtn\.addEventListener\('click'/);
  assert.match(script, /form\.reset\(\)/);

  for (const key of [
    'search.filters.minPrice', 'search.filters.maxPrice', 'search.filters.minRadius',
    'search.filters.anyRadius', 'search.filters.sort', 'search.filters.clear',
    'search.sort.recommended', 'search.sort.priceAsc', 'search.sort.priceDesc',
    'search.sort.radiusDesc', 'search.sort.recent'
  ]) {
    assert.ok(translations['pt-BR'][key], `pt-BR: ${key}`);
    assert.ok(translations['en-US'][key], `en-US: ${key}`);
  }
});

test('busca e hídratavel pela URL: filtros vem da query string e sincronizam via replaceState', () => {
  const script = read('public/search.js');
  assert.match(script, /new URLSearchParams\(window\.location\.search\)/);
  assert.match(script, /readFiltersFromUrl\(\)/);
  assert.match(script, /syncFiltersToUrl\(\)/);
  assert.match(script, /history\.replaceState/);
  // todos os filtros do formulario sao hidrataveis pela URL
  for (const parameter of ['state', 'city', 'specialty', 'availability', 'minPrice', 'maxPrice', 'minRadius', 'sort', 'page']) {
    assert.match(script, new RegExp(`params\\.(has|get|set)\\(["']${parameter}["']`));
  }
});

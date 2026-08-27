import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(file, 'utf8');

test('a busca avançada expõe preço, raio, ordenação e limpeza em uma interface bilíngue', () => {
  const html = read('public/busca.html');
  const script = read('public/search.js');
  const translations = read('public/lang.js');

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
    assert.equal(translations.split(`'${key}'`).length - 1, 2, `${key} deve existir em português e inglês`);
  }
});

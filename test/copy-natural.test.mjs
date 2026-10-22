import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readCatalogs } from '../test-utils/i18n.mjs';

test('os textos de apresentacao sao naturais e especificos', () => {
  const home = readFileSync(resolve('public', 'index.html'), 'utf8');
  const translations = readCatalogs();
  const source = `${home}\n${JSON.stringify(translations)}`;

  assert.doesNotMatch(source, /momentos fugazes|memórias eternas|legado visual|transformá-la em realidade|Descontos and/i);
  assert.match(JSON.stringify(translations['pt-BR']), /Retratos, casamentos e eventos fotografados/);
  assert.match(JSON.stringify(translations['en-US']), /Portraits, weddings and events photographed/);
  assert.match(home, /Conte o que você está planejando/);
  assert.match(home, /A LensClick nasceu em 2025/);
});

test('a grafia da marca e unificada em LensClick', () => {
  const home = readFileSync(resolve('public', 'index.html'), 'utf8');
  const translations = readCatalogs();
  const source = `${home}\n${JSON.stringify(translations)}`;

  // Decisao de marca: a grafia oficial e "LensClick". As variantes com
  // espaco agrupado nao podem reaparecer em copy, markup ou catalogo.
  assert.doesNotMatch(source, /Lens Click/i);
});

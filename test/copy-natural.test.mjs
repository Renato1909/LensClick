import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('os textos de apresentacao sao naturais e especificos', () => {
  const home = readFileSync(resolve('public', 'index.html'), 'utf8');
  const translations = readFileSync(resolve('public', 'lang.js'), 'utf8');
  const source = `${home}\n${translations}`;

  assert.doesNotMatch(source, /momentos fugazes|memórias eternas|legado visual|transformá-la em realidade|Descontos and/i);
  assert.match(translations, /Retratos, casamentos e eventos fotografados/);
  assert.match(translations, /Portraits, weddings and events photographed/);
  assert.match(home, /Conte o que você está planejando/);
  assert.match(home, /A Lens Click nasceu em 2025/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('a troca de idioma replica a animacao da versao antiga', () => {
  const translations = readFileSync(resolve('public', 'lang.js'), 'utf8');
  const styles = readFileSync(resolve('public', 'refinements.css'), 'utf8');

  assert.match(translations, /opacity \.28s ease, transform \.28s ease/);
  assert.match(translations, /translateY\(6px\)/);
  assert.match(translations, /classList\.add\('i18n-transitioning'\)/);
  assert.match(translations, /classList\.remove\('i18n-transitioning'\)/);
  assert.match(translations, /await wait\(220\)/);
  assert.match(translations, /window\.setTimeout\(\(\) => \{[\s\S]*?element\.style\.transition = ''[\s\S]*?element\.classList\.remove\('i18n-transitioning'\)[\s\S]*?\}, 350\)/);
  assert.doesNotMatch(translations, /animatedElems|is-switching|requestAnimationFrame\(reveal\)/);
  assert.match(translations, /function toggleLanguage\(\)[\s\S]*?return setLanguage/);
  assert.match(translations, /DOMContentLoaded[\s\S]*?initialize/);
  assert.match(translations, /prefers-reduced-motion: reduce/);
  assert.match(translations, /applyTranslations\(\{ animate = false \} = \{\}\)/);
  assert.doesNotMatch(styles, /\.lang-toggle\.is-switching/);
  assert.match(styles, /\.i18n-transitioning[\s\S]*transition-duration:\s*280ms\s*!important/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readCatalogs } from '../test-utils/i18n.mjs';

const read = (file) => readFileSync(file, 'utf8');

test('a galeria publica reserva espaco e prepara imagens responsivas com carregamento progressivo', () => {
  const html = read('public/fotografo.html');
  const script = read('public/photographer-profile.js');
  const styles = read('public/photographer.css');
  const translations = readCatalogs();

  assert.match(html, /id="photographerPortfolio"[^>]*role="list"/);
  assert.match(script, /figure\.setAttribute\('role', 'listitem'\)/);
  assert.match(script, /image\.width = index === 0 \? 1600 : 1200/);
  assert.match(script, /image\.height = 900/);
  assert.match(script, /image\.loading = 'lazy'/);
  assert.match(script, /image\.decoding = 'async'/);
  assert.match(script, /image\.sizes = index === 0/);
  assert.match(script, /image\.srcset = responsiveImageSources\(item\.imageUrl\)/);
  assert.match(script, /classList\.replace\('is-loading', 'is-loaded'\)/);
  assert.match(script, /classList\.replace\('is-loading', 'is-unavailable'\)/);

  assert.match(styles, /\.portfolio-image[^}]*aspect-ratio:\s*4\/3/);
  assert.match(styles, /\.portfolio-figure:first-child \.portfolio-image[^}]*aspect-ratio:\s*16\/9/);
  assert.match(styles, /content-visibility:\s*auto/);
  assert.match(styles, /contain-intrinsic-size:/);
  assert.match(styles, /prefers-reduced-motion:\s*reduce/);
  assert.ok(translations['pt-BR']['photographer.imageUnavailable']);
  assert.ok(translations['en-US']['photographer.imageUnavailable']);
});

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

test('a foto do perfil do fotografo usa variantes responsivas nas rotas e no frontend', () => {
  const heroScript = read('public/photographer-profile.js');
  const searchScript = read('public/search.js');
  const photographers = read('src/photographers.mjs');
  const accountSecurity = read('src/account-security.mjs');
  const portfolio = read('src/portfolio.mjs');
  const imagesModule = read('src/images.mjs');

  assert.match(heroScript, /imageElement\.srcset = responsiveImageSources\(profile\.profilePic\)/);
  assert.match(heroScript, /imageElement\.sizes = '150px'/);
  assert.match(searchScript, /img\.sizes = '\(max-width: 720px\) 100vw, 104px'/);
  assert.match(searchScript, /&width=\$\{width\} \$\{width\}w/);
  assert.match(imagesModule, /320, 640, 1280/);
  assert.match(photographers, /responsiveImage\(await env\.PROFILE_IMAGES\.get\(profile\.profile_pic_key\), request, env, PUBLIC_IMAGE_CACHE\)/);
  assert.match(accountSecurity, /responsiveImage\(await env\.PROFILE_IMAGES\.get\(current\.profile_pic_key\), request, env, PRIVATE_IMAGE_CACHE\)/);
  assert.match(portfolio, /responsiveImage\(await env\.PROFILE_IMAGES\.get\(item\.object_key\), request, env, PRIVATE_IMAGE_CACHE\)/);
  assert.doesNotMatch(photographers, /async function responsiveImage/);
  assert.doesNotMatch(portfolio, /async function responsiveImage/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const readPublic = (file) => readFileSync(resolve('public', file), 'utf8');

test('a Fase 6 oferece estrutura e foco acessiveis nas paginas ativas', () => {
  const pages = ['index.html', 'login.html', 'cadastro.html', 'perfil.html', 'termos.html', 'privacidade.html'];

  pages.forEach((page) => {
    const html = readPublic(page);
    assert.doesNotMatch(html, /class="skip-link"/);
    assert.match(html, /<main[^>]+id="main-content"[^>]+tabindex="-1"|<main id="main-content"[^>]+tabindex="-1"/);
  });

  assert.match(readPublic('login.html'), /<h1[^>]+data-i18n="login\.title"/);
  assert.match(readPublic('cadastro.html'), /<h1[^>]+data-i18n="signup\.title"/);
  assert.match(readPublic('cadastro.html'), /aria-describedby="signupPasswordHint"/);
});

test('a pagina inicial possui controles completos para teclado e leitores de tela', () => {
  const home = readPublic('index.html');

  assert.equal((home.match(/<h1\b/g) || []).length, 1);
  assert.doesNotMatch(home, /id="carouselToggle"|carouselPaused/);
  assert.match(home, /if \(document\.hidden\) return;/);
  assert.match(home, /setInterval\(nextSlide, 5000\)/);
  assert.match(home, /item\.toggleAttribute\('inert', !active\)/);
  assert.match(home, /dot\.setAttribute\('aria-pressed', String\(active\)\)/);
  assert.match(home, /event\.key === 'ArrowRight'/);
  assert.match(home, /event\.key === 'Home'/);
  assert.match(home, /btn\.setAttribute\('aria-controls', answerId\)/);
  assert.match(home, /event\.key === 'Tab' && modal\.classList\.contains\('open'\)/);
  assert.match(home, /aria-atomic="true"/);
});

test('a camada compartilhada respeita foco, contraste e validade dos campos', () => {
  const styles = readPublic('refinements.css');
  const ux = readPublic('ux.js');

  assert.doesNotMatch(styles, /\.skip-link|\.carousel-toggle/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /@media \(forced-colors: active\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(ux, /setAttribute\('aria-invalid', 'true'\)/);
  assert.match(ux, /translations\.updated/);
});

test('o consentimento de cadastro e seus links possuem traducao completa', () => {
  const signup = readPublic('cadastro.html');
  const translations = readPublic('lang.js');

  assert.match(signup, /data-i18n="signup\.consent" data-i18n-html="true"/);
  assert.match(translations, /'signup\.consent': 'Li e concordo/);
  assert.match(translations, /'signup\.consent': 'I have read and agree/);
  assert.match(translations, />Terms of Use<\/a> and <a[^>]+>Privacy Policy<\/a>/);
});

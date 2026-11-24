import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (file) => readFileSync(resolve(file), 'utf8');

function publicPages() {
  return readdirSync(resolve('public')).filter((file) => file.endsWith('.html'));
}

test('os ativos oficiais da marca estao no repositorio', () => {
  const required = [
    'public/brand/lensclick-mark-light.png',
    'public/brand/lensclick-mark-dark.png',
    'public/brand/lensclick-lockup-light.png',
    'public/brand/lensclick-lockup-dark.png',
    'public/brand/lensclick-icon.png',
    'public/brand/lensclick-banner.jpg',
    'public/og/lensclick-cover.jpg',
    'public/favicon-32.png',
    'public/apple-touch-icon.png'
  ];
  for (const file of required) {
    assert.ok(existsSync(resolve(file)), `ativo ausente: ${file}`);
  }
});

test('a imagem social oficial e a do aplicativo Android', () => {
  const worker = read('src/worker.mjs');
  assert.match(worker, /const OG_IMAGE_PATH = '\/og\/lensclick-cover\.jpg'/);
  assert.match(worker, /OG_IMAGE_WIDTH = '1200'/);
  assert.match(worker, /OG_IMAGE_HEIGHT = '630'/);
});

test('o cabecalho usa o monograma oficial em vez de um logo em CSS', () => {
  const home = read('public/index.html');
  assert.match(home, /class="brand-mark" src="brand\/lensclick-mark-light\.png"/);
  assert.match(home, /class="brand-word">LensClick</);
  // O logo antigo era um quadrado gradiente com icone de biblioteca.
  assert.doesNotMatch(home, /class="brand"[\s\S]{0,200}fas fa-camera/);
  assert.doesNotMatch(home, /\.brand \.logo\{/);
  assert.doesNotMatch(home, /\.brand \.click\{/);
});

test('login e cadastro usam o ícone oficial e mantêm os botões na largura do card', () => {
  for (const file of ['public/login.html', 'public/cadastro.html']) {
    const page = read(file);
    assert.match(page, /class="auth-logo"[^>]*>[\s\S]{0,80}<img src="brand\/lensclick-icon\.png"/, file);
    assert.doesNotMatch(page, /fa-camera/, file);
    assert.match(page, /\.auth-footer\s*\{[^}]*width:\s*100%[^}]*box-sizing:\s*border-box/, file);
  }
  assert.match(read('public/login.html'), /\.auth-card\s*\{[^}]*box-sizing:\s*border-box/);
});

test('estilos inline de login e cadastro têm chaves balanceadas', () => {
  for (const file of ['public/login.html', 'public/cadastro.html']) {
    const css = /<style>([\s\S]*?)<\/style>/.exec(read(file))[1];
    assert.equal((css.match(/\{/g) || []).length, (css.match(/\}/g) || []).length, file);
  }
});

test('as paginas legais tambem usam o monograma oficial', () => {
  for (const file of ['public/privacidade.html', 'public/termos.html']) {
    const page = read(file);
    assert.match(page, /class="brand-mark brand-mark-sm" src="brand\/lensclick-mark-light\.png"/, file);
    assert.match(page, /class="brand-word">LensClick</, file);
  }
});

test('as paginas legais usam o botao de idioma padronizado da pagina inicial', () => {
  const home = read('public/index.html');
  const styles = read('public/refinements.css');
  assert.match(home, /<button id="langToggle" class="lang-toggle"/);
  assert.match(styles, /\.lang-toggle \.abbr\s*\{[^}]*font-weight: 700/);
  assert.match(styles, /\.legal-header\s*\{[^}]*justify-content: space-between/);

  for (const file of ['public/privacidade.html', 'public/termos.html']) {
    const page = read(file);
    assert.match(page, /<header class="legal-header">/, file);
    assert.match(page, /<button id="langToggle" class="lang-toggle"/, file);
    assert.doesNotMatch(page, /class="public-language"/, file);
  }
});

test('todas as paginas declaram o icone do site', () => {
  for (const file of publicPages()) {
    const page = read(`public/${file}`);
    assert.match(page, /<link rel="icon" href="favicon-32\.png"/, file);
    assert.match(page, /<link rel="apple-touch-icon" href="apple-touch-icon\.png">/, file);
  }
});

test('a wordmark usa a serifa da marca', () => {
  const tokens = read('public/refinements.css');
  assert.match(tokens, /\.brand-word\s*\{[^}]*font-family: "Playfair Display"/);
  assert.match(tokens, /\.brand-word\s*\{[^}]*color: var\(--lc-color-brand-primary\)/);
  assert.match(tokens, /\.brand-mark\s*\{[^}]*width: 30px/);
});

test('as paginas que exibem a wordmark carregam a serifa da marca', () => {
  for (const file of ['public/index.html', 'public/privacidade.html', 'public/termos.html']) {
    assert.match(read(file), /Playfair\+Display/, file);
  }
});

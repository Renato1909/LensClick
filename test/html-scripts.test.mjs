import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pages = ['index.html', 'cadastro.html', 'login.html', 'recuperar-senha.html', 'redefinir-senha.html', 'perfil.html', 'privacidade.html', 'termos.html'];

for (const page of pages) {
  test(`${page} possui scripts inline sintaticamente válidos`, () => {
    const html = readFileSync(resolve('public', page), 'utf8');
    const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);
    for (const source of inlineScripts) {
      assert.doesNotThrow(() => new Function(source), `Script inválido em ${page}`);
    }
  });
}

test('as páginas ativas não usam dados de conta no localStorage', () => {
  for (const file of [...pages, 'profile-api.js']) {
    const source = readFileSync(resolve('public', file), 'utf8');
    assert.doesNotMatch(source, /localStorage\.(?:getItem|setItem|removeItem)\(['"](?:users|currentUser)['"]/, file);
  }
});

for (const script of ['lang.js', 'ux.js', 'profile-api.js']) {
  test(`${script} possui sintaxe válida`, () => {
    const source = readFileSync(resolve('public', script), 'utf8');
    assert.doesNotThrow(() => new Function(source), `Script inválido em ${script}`);
  });
}

test('a camada visual da Fase 2 está vinculada às páginas principais', () => {
  const expectedBodyClass = {
    'index.html': 'home-page',
    'cadastro.html': 'auth-page',
    'login.html': 'auth-page',
    'recuperar-senha.html': 'auth-page',
    'redefinir-senha.html': 'auth-page',
    'perfil.html': 'profile-page',
    'privacidade.html': 'legal-page',
    'termos.html': 'legal-page'
  };
  for (const [file, bodyClass] of Object.entries(expectedBodyClass)) {
    const source = readFileSync(resolve('public', file), 'utf8');
    assert.match(source, /<link rel="stylesheet" href="refinements\.css">/, file);
    assert.match(source, new RegExp(`<body class="[^"]*${bodyClass}[^"]*">`), file);
  }
});

test('a tradução preserva títulos formatados, tooltips e links do rodapé', () => {
  const home = readFileSync(resolve('public', 'index.html'), 'utf8');
  const translations = readFileSync(resolve('public', 'lang.js'), 'utf8');

  assert.match(home, /data-i18n="section\.servicesTitle"/);
  assert.match(home, /data-i18n="section\.portfolioTitle"/);
  assert.match(translations, /'section\.services': 'Services'/);
  assert.match(translations, /'section\.portfolio': 'Portfolio'/);
  assert.equal((translations.match(/'privacy\.footer':/g) || []).length, 2);
  assert.match(translations, /function translatedOrOriginal/);
  assert.match(translations, /replace\(\/<\[\^>\]\*>\/g, ''\)/);
});

test('a Fase 3 centraliza feedback e carregamento dos fluxos', () => {
  const ux = readFileSync(resolve('public', 'ux.js'), 'utf8');
  const home = readFileSync(resolve('public', 'index.html'), 'utf8');
  const login = readFileSync(resolve('public', 'login.html'), 'utf8');
  const signup = readFileSync(resolve('public', 'cadastro.html'), 'utf8');
  const profile = readFileSync(resolve('public', 'profile-api.js'), 'utf8');

  assert.match(ux, /async function apiFetch/);
  assert.match(ux, /function setBusy/);
  assert.match(ux, /function showMessage/);
  assert.match(home, /data-service-index="1"/);
  assert.match(home, /role="tablist"/);
  assert.match(login, /safeNextDestination/);
  assert.match(signup, /setCustomValidity/);
  assert.match(profile, /login\.html\?next=perfil\.html/);
});

test('as opções do seletor de serviço permanecem legíveis', () => {
  const styles = readFileSync(resolve('public', 'refinements.css'), 'utf8');
  assert.match(styles, /\.home-page select option[\s\S]*color:\s*#000000/);
});

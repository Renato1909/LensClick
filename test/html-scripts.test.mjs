import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readCatalogs } from '../test-utils/i18n.mjs';

const pages = ['index.html', 'cadastro.html', 'login.html', 'recuperar-senha.html', 'redefinir-senha.html', 'verificar-email.html', 'admin.html', 'perfil.html', 'fotografo.html', 'privacidade.html', 'termos.html'];

for (const page of pages) {
  test(`${page} não possui scripts inline`, () => {
    const html = readFileSync(resolve('public', page), 'utf8');
    const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);
    assert.equal(inlineScripts.length, 0, `${page} contém JavaScript inline`);
  });
}

test('as páginas ativas não usam dados de conta no localStorage', () => {
  for (const file of [...pages, 'profile-api.js']) {
    const source = readFileSync(resolve('public', file), 'utf8');
    assert.doesNotMatch(source, /localStorage\.(?:getItem|setItem|removeItem)\(['"](?:users|currentUser)['"]/, file);
  }
});

for (const script of [
  'lang.js', 'ux.js', 'profile-api.js', 'photographer-profile.js',
  'home.js', 'signup.js', 'login.js', 'password-recovery.js', 'password-reset.js', 'verificar-email.js', 'admin.js'
]) {
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
    'verificar-email.html': 'auth-page',
    'admin.html': 'auth-page',
    'perfil.html': 'profile-page',
    'fotografo.html': 'photographer-page',
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
  const runtime = readFileSync(resolve('public', 'lang.js'), 'utf8');
  const translations = readCatalogs();

  assert.match(home, /data-i18n="section\.servicesTitle"/);
  assert.match(home, /data-i18n="section\.portfolioTitle"/);
  assert.equal(translations['en-US']['section.services'], 'Services');
  assert.equal(translations['en-US']['section.portfolio'], 'Portfolio');
  assert.ok(translations['pt-BR']['privacy.footer']);
  assert.ok(translations['en-US']['privacy.footer']);
  assert.match(runtime, /function translatedOrOriginal/);
  assert.match(runtime, /replace\(\/<\[\^>\]\*>\/g, ''\)/);
});

test('a Fase 3 centraliza feedback e carregamento dos fluxos', () => {
  const ux = readFileSync(resolve('public', 'ux.js'), 'utf8');
  const home = readFileSync(resolve('public', 'index.html'), 'utf8');
  const login = readFileSync(resolve('public', 'login.js'), 'utf8');
  const signup = readFileSync(resolve('public', 'signup.js'), 'utf8');
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

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const publicDir = resolve('public');
const pageNames = ['index.html', 'login.html', 'cadastro.html', 'recuperar-senha.html', 'redefinir-senha.html', 'perfil.html', 'termos.html', 'privacidade.html', 'perfil_temp.html'];
const readPublic = (file) => readFileSync(resolve(publicDir, file), 'utf8');

test('a Fase 8 elimina recarregamento indevido e navegacao inline', () => {
  const home = readPublic('index.html');
  const newsletterFlow = home.slice(
    home.indexOf("document.getElementById('newsletterForm').addEventListener"),
    home.indexOf('// Check user authentication state')
  );

  assert.match(newsletterFlow, /event\.preventDefault\(\)/);
  assert.doesNotMatch(newsletterFlow, /passive:\s*true/);
  pageNames.forEach(page => assert.doesNotMatch(readPublic(page), /\sonclick=/));
  assert.match(home, /window\.addEventListener\('scroll',[\s\S]*?\{ passive: true \}\)/);
});

test('links e arquivos locais referenciados existem', () => {
  pageNames.forEach((page) => {
    const html = readPublic(page);
    const references = [...html.matchAll(/\s(?:href|src)="([^"]*)"/g)].map(match => match[1]);
    references.forEach((reference) => {
      if (!reference || /^(?:#|https?:|mailto:|data:)/i.test(reference)) return;
      const cleanPath = reference.split(/[?#]/)[0];
      assert.equal(existsSync(resolve(publicDir, cleanPath.replace(/^\//, ''))), true, `${page}: ${reference}`);
    });
  });
});

test('paginas nao possuem IDs duplicados e links externos sao seguros', () => {
  pageNames.forEach((page) => {
    const html = readPublic(page);
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
    assert.equal(new Set(ids).size, ids.length, `${page} possui ID duplicado`);

    const externalTabs = [...html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)];
    externalTabs.forEach(([tag]) => assert.match(tag, /rel="[^"]*noopener[^"]*"/));
  });
});

test('rodape usa ano dinamico e o Worker mantem cabecalhos de seguranca', () => {
  const translations = readPublic('lang.js');
  const worker = readFileSync(resolve('src', 'worker.mjs'), 'utf8');

  assert.match(translations, /© \{year\} Lens Click/);
  assert.match(translations, /function copyrightYear\(\)/);
  assert.match(translations, /replaceAll\('\{year\}', copyrightYear\(\)\)/);
  assert.match(worker, /'Content-Security-Policy'/);
  assert.match(worker, /'X-Content-Type-Options': 'nosniff'/);
  assert.match(worker, /'X-Frame-Options': 'DENY'/);
  assert.match(worker, /'Referrer-Policy': 'strict-origin-when-cross-origin'/);
  assert.match(worker, /'Permissions-Policy'/);
});

test('a pagina temporaria de perfil e apenas um redirecionamento seguro', () => {
  const redirect = readPublic('perfil_temp.html');

  assert.match(redirect, /http-equiv="refresh" content="0; url=perfil\.html"/);
  assert.match(redirect, /rel="canonical" href="perfil\.html"/);
  assert.doesNotMatch(redirect, /<script|localStorage|sessionStorage/);
});

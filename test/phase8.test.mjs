import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readCatalogs } from '../test-utils/i18n.mjs';

const publicDir = resolve('public');
const pageNames = ['index.html', 'login.html', 'cadastro.html', 'recuperar-senha.html', 'redefinir-senha.html', 'perfil.html', 'termos.html', 'privacidade.html', 'perfil_temp.html'];
const readPublic = (file) => readFileSync(resolve(publicDir, file), 'utf8');

test('a Fase 8 elimina recarregamento indevido e navegacao inline', () => {
  const home = readPublic('index.html');
  const homeScript = readPublic('home.js');
  const newsletterFlow = homeScript.slice(
    homeScript.indexOf("document.getElementById('newsletterForm').addEventListener"),
    homeScript.indexOf('// Check user authentication state')
  );

  assert.match(newsletterFlow, /event\.preventDefault\(\)/);
  assert.doesNotMatch(newsletterFlow, /passive:\s*true/);
  pageNames.forEach(page => assert.doesNotMatch(readPublic(page), /\sonclick=/));
  assert.match(homeScript, /window\.addEventListener\('scroll',[\s\S]*?\{ passive: true \}\)/);
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

test('rodape usa ano dinamico e respostas mantem cabecalhos de seguranca', () => {
  const runtime = readPublic('lang.js');
  const translations = readCatalogs();
  const worker = readFileSync(resolve('src', 'worker.mjs'), 'utf8');
  const assetHeaders = readPublic('_headers');

  assert.match(translations['pt-BR'].footer, /© \{year\} Lens Click/);
  assert.match(translations['en-US'].footer, /© \{year\} Lens Click/);
  assert.match(runtime, /function currentYear\(\)/);
  assert.match(runtime, /function interpolate\(message, params = \{\}\)/);
  assert.match(worker, /'Content-Security-Policy'/);
  assert.match(worker, /'Strict-Transport-Security': 'max-age=63072000; includeSubDomains'/);
  assert.match(worker, /script-src 'self'/);
  assert.doesNotMatch(worker, /script-src[^;]*'unsafe-inline'/);
  assert.match(worker, /'X-Content-Type-Options': 'nosniff'/);
  assert.match(worker, /'X-Frame-Options': 'DENY'/);
  assert.match(worker, /'Referrer-Policy': 'strict-origin-when-cross-origin'/);
  assert.match(worker, /'Permissions-Policy'/);
  assert.match(assetHeaders, /^\/\*/m);
  assert.match(assetHeaders, /Content-Security-Policy:.*script-src 'self';/);
  assert.doesNotMatch(assetHeaders, /script-src[^;]*'unsafe-inline'/);
  assert.match(assetHeaders, /Strict-Transport-Security: max-age=63072000; includeSubDomains/);
  assert.match(assetHeaders, /X-Content-Type-Options: nosniff/);
  assert.match(assetHeaders, /X-Frame-Options: DENY/);
  assert.match(assetHeaders, /Referrer-Policy: strict-origin-when-cross-origin/);
  assert.match(assetHeaders, /Permissions-Policy: camera=\(\), microphone=\(\), geolocation=\(\)/);
});

test('a pagina temporaria de perfil e apenas um redirecionamento seguro', () => {
  const redirect = readPublic('perfil_temp.html');

  assert.match(redirect, /http-equiv="refresh" content="0; url=perfil\.html"/);
  assert.match(redirect, /rel="canonical" href="perfil\.html"/);
  assert.doesNotMatch(redirect, /<script|localStorage|sessionStorage/);
});

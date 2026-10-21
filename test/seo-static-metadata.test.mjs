import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { renderPublicProfilePage } from '../src/worker.mjs';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (file) => readFileSync(resolve('public', file), 'utf8');
const ORIGIN = 'https://lensclick.test';

function environment(html) {
  return {
    ASSETS: { fetch: async () => new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=UTF-8' } }) }
  };
}

async function serve(path, file) {
  const response = await worker.fetch(new Request(`${ORIGIN}${path}`), environment(read(file)));
  return { status: response.status, headers: response.headers, body: await response.text() };
}

const INDEXABLE = [
  ['/', 'index.html'],
  ['/busca.html', 'busca.html'],
  ['/termos.html', 'termos.html'],
  ['/privacidade.html', 'privacidade.html']
];

const NOT_INDEXABLE = [
  ['/cadastro.html', 'cadastro.html'],
  ['/login.html', 'login.html'],
  ['/recuperar-senha.html', 'recuperar-senha.html'],
  ['/redefinir-senha.html', 'redefinir-senha.html'],
  ['/verificar-email.html', 'verificar-email.html']
];

test('paginas publicas estaticas recebem metadados sociais e JSON-LD', async () => {
  const html = '<!doctype html><html><head><title>Busca de fotógrafos | LensClick</title><meta name="description" content="Encontre fotógrafos."></head><body></body></html>';
  const response = await worker.fetch(new Request(`${ORIGIN}/busca.html`), environment(html));
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.match(body, /rel="canonical"/);
  assert.match(body, /property="og:title"/);
  assert.match(body, /property="og:description"/);
  assert.match(body, /application\/ld\+json/);
  assert.match(body, /"@type":"WebSite"/);
  assert.match(body, /"@type":"Organization"/);
});

test('a home entrega canonical, description, og:image, twitter card e JSON-LD da marca', async () => {
  const { body } = await serve('/', 'index.html');

  assert.match(body, /<link rel="canonical" href="https:\/\/lensclick\.test\/">/);
  assert.match(body, /<meta name="description" content="Encontre fotógrafos profissionais/);
  assert.match(body, /property="og:site_name" content="LensClick"/);
  assert.match(body, /property="og:locale" content="pt_BR"/);
  assert.match(body, /property="og:image" content="https:\/\//);
  assert.match(body, /property="og:image:width" content="1200"/);
  assert.match(body, /property="og:image:height" content="630"/);
  assert.match(body, /name="twitter:card" content="summary_large_image"/);
  assert.match(body, /name="twitter:image" content="https:\/\//);
  assert.match(body, /"@type":"WebSite"/);
  assert.match(body, /"@type":"Organization"/);
  assert.match(body, /"@type":"WebPage"/);
});

test('cada pagina indexavel tem exatamente um canonical e nenhum robots', async () => {
  for (const [path, file] of INDEXABLE) {
    const { body } = await serve(path, file);
    assert.equal((body.match(/rel="canonical"/g) || []).length, 1, path);
    assert.doesNotMatch(body, /<meta name="robots"/, path);
    assert.match(body, /<meta name="description" content="/, path);
    assert.equal((body.match(/application\/ld\+json/g) || []).length, 1, path);
  }
});

test('o canonical ignora a query string e os parametros de rastreamento', async () => {
  const { body } = await serve('/busca.html?city=Sao-Paulo&utm_source=whatsapp', 'busca.html');

  assert.match(body, /<link rel="canonical" href="https:\/\/lensclick\.test\/busca\.html">/);
  assert.doesNotMatch(body, /rel="canonical" href="[^"]*\?/);
  assert.doesNotMatch(body, /rel="canonical" href="[^"]*utm_/);
});

test('paginas de autenticacao sao noindex, sem canonical e sem JSON-LD', async () => {
  for (const [path, file] of NOT_INDEXABLE) {
    const { body } = await serve(path, file);
    assert.match(body, /<meta name="robots" content="noindex, follow">/, path);
    assert.doesNotMatch(body, /rel="canonical"/, path);
    assert.doesNotMatch(body, /application\/ld\+json/, path);
  }
});

test('/index.html redireciona permanentemente para a raiz', async () => {
  const response = await worker.fetch(new Request(`${ORIGIN}/index.html`), environment(read('index.html')));
  assert.equal(response.status, 301);
  assert.equal(response.headers.get('location'), `${ORIGIN}/`);
});

test('/perfil_temp.html redireciona permanentemente para /perfil.html', async () => {
  const response = await worker.fetch(new Request(`${ORIGIN}/perfil_temp.html`), environment(read('perfil_temp.html')));
  assert.equal(response.status, 301);
  assert.equal(response.headers.get('location'), `${ORIGIN}/perfil.html`);
});

test('paginas privadas recebem X-Robots-Tag e nao sao indexaveis', async () => {
  for (const [path, file] of [['/admin.html', 'admin.html'], ['/perfil.html', 'perfil.html']]) {
    const { headers, body } = await serve(path, file);
    assert.equal(headers.get('x-robots-tag'), 'noindex, nofollow', path);
    assert.doesNotMatch(body, /rel="canonical"/, path);
  }
});

test('a pagina de perfil publico continua sendo indexavel e canonica', async () => {
  // O SSR tem o proprio contrato de metadados: a mudanca das paginas
  // estaticas nao pode ter derrubado canonical, robots ou o JSON-LD do perfil.
  const template = read('fotografo.html');
  const html = renderPublicProfilePage(template, {
    slug: 'ana-luz',
    name: 'Ana Luz',
    bio: 'Fotografia documental em Sao Paulo.',
    specialties: JSON.stringify(['wedding']),
    city: 'Sao Paulo',
    state: 'SP',
    availability: 'available',
    is_published: 1,
    profile_pic_key: 'profiles/ana.webp',
    user_updated_at: '2026-10-01 10:00:00',
    updated_at: '2026-10-01 10:00:00'
  }, `${ORIGIN}/fotografo/ana-luz`);

  assert.match(html, /<link rel="canonical" href="https:\/\/lensclick\.test\/fotografo\/ana-luz">/);
  assert.doesNotMatch(html, /<meta name="robots" content="noindex/);
  assert.match(html, /"@type":"ProfilePage"/);
  assert.match(html, /property="og:image"/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import worker, { renderMissingProfilePage, renderPublicProfilePage } from '../src/worker.mjs';
import { normalizeRoute } from '../src/observability.mjs';

const read = (file) => readFileSync(resolve(file), 'utf8');
const template = read('public/fotografo.html');

function profile(overrides = {}) {
  return {
    slug: 'ana-luz',
    name: 'Ana Luz',
    bio: 'Fotografia documental em São Paulo.',
    specialties: JSON.stringify(['wedding', 'portrait']),
    city: 'São Paulo',
    state: 'SP',
    availability: 'available',
    is_published: 1,
    profile_pic_key: 'profiles/ana.webp',
    user_updated_at: '2026-08-31 12:00:00',
    updated_at: '2026-08-31 12:00:00',
    ...overrides
  };
}

test('o perfil indexavel entrega URL canonica, Open Graph e ProfilePage no HTML', () => {
  const html = renderPublicProfilePage(template, profile(), 'https://lensclick.example/fotografo/ana-luz');

  assert.match(html, /<base href="\/">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/lensclick\.example\/fotografo\/ana-luz">/);
  assert.match(html, /<meta property="og:type" content="profile">/);
  assert.match(html, /<script type="application\/ld\+json">/);
  assert.match(html, /"@type":"ProfilePage"/);
  assert.match(html, /"mainEntity":\{"@type":"Person"/);
  assert.match(html, /<h1 id="photographerName">Ana Luz<\/h1>/);
  assert.match(html, /<article id="professionalProfile">/);
});

test('o SSR escapa conteudo do profissional em HTML, atributos e JSON-LD', () => {
  const attack = '</script><script>alert("x")</script>';
  const html = renderPublicProfilePage(template, profile({ name: `Ana ${attack}`, bio: attack }), 'https://lensclick.example/');

  assert.doesNotMatch(html, /<script>alert\("x"\)<\/script>/);
  assert.match(html, /Ana &lt;\/script&gt;&lt;script&gt;alert/);
  assert.match(html, /\\u003c\/script\\u003e\\u003cscript\\u003ealert/);
});

test('perfil ausente exibe erro rastreavel como 404 e nao deve ser indexado', () => {
  const html = renderMissingProfilePage(template);

  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.match(html, /<section class="profile-error" id="profileError" aria-labelledby=/);
  assert.match(html, /id="profileLoading" role="status" hidden/);
});

test('links internos e hidratacao usam a rota amigavel preservando compatibilidade legada', () => {
  const search = read('public/search.js');
  const account = read('public/profile-api.js');
  const hydration = read('public/photographer-profile.js');
  const config = read('wrangler.jsonc');

  assert.match(search, /`\/fotografo\/\$\{encodeURIComponent\(p\.slug\)\}`/);
  assert.match(account, /`\/fotografo\/\$\{encodeURIComponent\(profile\.slug\)\}`/);
  assert.match(hydration, /window\.location\.pathname\.match/);
  assert.match(hydration, /new URLSearchParams\(window\.location\.search\)\.get\('perfil'\)/);
  assert.match(config, /"\/fotografo\/\*"/);
});

test('a URL legada redireciona permanentemente para a rota canonica', async () => {
  const response = await worker.fetch(
    new Request('https://lensclick.example/fotografo.html?perfil=ana-luz'),
    {},
    {}
  );

  assert.equal(response.status, 301);
  assert.equal(response.headers.get('Location'), 'https://lensclick.example/fotografo/ana-luz');
});

test('a rota amigavel publicada responde HTML indexavel com cabecalhos de seguranca', async () => {
  let assetRequest;
  const env = {
    DB: { prepare: () => ({ bind: () => ({ first: async () => profile() }) }) },
    ASSETS: { fetch: async (request) => {
      assetRequest = request;
      return new Response(template, { headers: { 'Content-Type': 'text/html' } });
    } }
  };
  const response = await worker.fetch(
    new Request('https://lensclick.example/fotografo/ana-luz'),
    env,
    {}
  );
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.equal(assetRequest.method, 'GET');
  assert.equal(new URL(assetRequest.url).pathname, '/fotografo.html');
  assert.equal(response.headers.get('Cache-Control'), 'public, max-age=60');
  assert.match(response.headers.get('Content-Security-Policy'), /default-src 'self'/);
  assert.match(html, /<link rel="canonical" href="https:\/\/lensclick\.example\/fotografo\/ana-luz">/);
});

test('perfil inexistente responde 404 HTML com noindex', async () => {
  const env = {
    DB: { prepare: () => ({ bind: () => ({ first: async () => null }) }) },
    ASSETS: { fetch: async () => new Response(template, { headers: { 'Content-Type': 'text/html' } }) }
  };
  const response = await worker.fetch(
    new Request('https://lensclick.example/fotografo/perfil-ausente'),
    env,
    {}
  );

  assert.equal(response.status, 404);
  assert.match(response.headers.get('Content-Type'), /text\/html/);
  assert.match(await response.text(), /<meta name="robots" content="noindex">/);
  assert.equal(normalizeRoute('https://lensclick.example/fotografo/perfil-ausente'), '/fotografo/:slug');
});

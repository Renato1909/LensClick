import {
  buildRequestCompletedEvent,
  completeRequest,
  createRequestContext,
  errorCategoryForStatus,
  reportOperationalError,
  responseWithRequestId
} from './observability.mjs';
import { createRequestRouter } from './router.mjs';
import { createAuthHandlers } from './auth.mjs';
import { createAdminHandlers } from './admin.mjs';
import { createPhotographerHandlers } from './photographers.mjs';
import { createAccountHandlers } from './account.mjs';
import { createPublicInputHandlers } from './public-input.mjs';
import { createPortfolioHandlers } from './portfolio.mjs';
import { createAccountSecurityHandlers } from './account-security.mjs';
import { createImageService } from './images.mjs';
import { createMonitoringHandlers, recordRequestSample } from './monitoring.mjs';

const SESSION_COOKIE = 'lensclick_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ACTIVE_WEB_SESSIONS = 5;
const MAX_ACTIVE_MOBILE_SESSIONS = 3;
const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 700_000;
const MAX_PROFILE_PICTURE_BYTES = 450_000;
const MAX_PORTFOLIO_IMAGE_BYTES = 4_000_000;
const MAX_PORTFOLIO_ITEMS = 12;
const PROFESSIONAL_SPECIALTIES = new Set([
  'wedding', 'events', 'portrait', 'family', 'corporate',
  'product', 'fashion', 'newborn', 'nature', 'real-estate'
]);
// Cloudflare Workers Web Crypto accepts at most 100,000 PBKDF2 iterations.
const PBKDF2_ITERATIONS = 100_000;

const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https://images.unsplash.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
};

function cleanText(value, maxLength) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function normalizeEmail(value) {
  return cleanText(value, 254).toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

function isValidPassword(value) {
  return value.length >= 8 && /\p{L}/u.test(value) && /\d/.test(value);
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'fotografo';
}

function normalizeWebsite(value) {
  const text = cleanText(value, 300);
  if (!text) return '';
  try {
    const url = new URL(text);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

function parseSpecialties(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item)).filter((item) => PROFESSIONAL_SPECIALTIES.has(item)))].slice(0, 6);
}

function storedSpecialties(value) {
  try {
    return parseSpecialties(JSON.parse(value || '[]'));
  } catch {
    return [];
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeJsonForHtml(value) {
  return JSON.stringify(value)
    .replace(/&/g, '\\u0026')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e');
}

function replaceElementText(html, id, value) {
  const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return html.replace(
    new RegExp(`(<[^>]+id=["']${escapedId}["'][^>]*>)[\\s\\S]*?(<\\/[^>]+>)`),
    `$1${escapeHtml(value)}$2`
  );
}

const SPECIALTY_LABELS = Object.freeze({
  wedding: 'Casamentos', events: 'Eventos', portrait: 'Retratos', family: 'Família',
  corporate: 'Corporativo', product: 'Produtos', fashion: 'Moda', newborn: 'Newborn',
  nature: 'Natureza', 'real-estate': 'Imóveis'
});

export function renderPublicProfilePage(template, row, requestUrl) {
  const profile = professionalProfile(row);
  const canonicalUrl = new URL(`/fotografo/${encodeURIComponent(profile.slug)}`, requestUrl).toString();
  const location = [profile.city, profile.state].filter(Boolean).join(', ');
  const description = cleanText(profile.bio, 155)
    || `${profile.name}, fotógrafo profissional${location ? ` em ${location}` : ''} na LensClick.`;
  const imageUrl = profile.profilePic ? new URL(profile.profilePic, requestUrl).toString() : '';
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    url: canonicalUrl,
    name: `${profile.name} | LensClick`,
    description,
    dateModified: row.updated_at || row.user_updated_at,
    mainEntity: {
      '@type': 'Person',
      identifier: profile.slug,
      name: profile.name,
      description: profile.bio,
      ...(imageUrl ? { image: imageUrl } : {}),
      ...(location ? { address: { '@type': 'PostalAddress', addressLocality: profile.city, addressRegion: profile.state, addressCountry: 'BR' } } : {})
    }
  };
  const head = [
    `<link rel="canonical" href="${escapeHtml(canonicalUrl)}">`,
    '<meta property="og:type" content="profile">',
    `<meta property="og:title" content="${escapeHtml(`${profile.name} | LensClick`)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:url" content="${escapeHtml(canonicalUrl)}">`,
    ...(imageUrl ? [`<meta property="og:image" content="${escapeHtml(imageUrl)}">`] : []),
    `<script type="application/ld+json">${escapeJsonForHtml(structuredData)}</script>`
  ].join('\n  ');

  let html = template
    .replace('<meta name="description" content="Conheça um fotógrafo profissional na LensClick.">', `<meta name="description" content="${escapeHtml(description)}">`)
    .replace('<title data-i18n="photographer.title">Perfil profissional | LensClick</title>', `<title>${escapeHtml(profile.name)} | LensClick</title>`)
    .replace('<!-- LENSCLICK_SSR_HEAD -->', head)
    .replace('<div class="profile-loading" id="profileLoading" role="status">', '<div class="profile-loading" id="profileLoading" role="status" hidden>')
    .replace('<article id="professionalProfile" hidden>', '<article id="professionalProfile">');
  html = replaceElementText(html, 'photographerName', profile.name);
  html = replaceElementText(html, 'photographerLocation', location);
  html = replaceElementText(html, 'photographerBio', profile.bio);
  html = replaceElementText(html, 'photographerInitials', profile.name.split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase());
  html = html.replace(
    '<div class="hero-status" id="photographerAvailability"></div>',
    `<div class="hero-status" id="photographerAvailability" data-status="${escapeHtml(profile.availability)}">${escapeHtml(profile.availability)}</div>`
  );
  html = html.replace(
    '<div class="public-specialties" id="photographerSpecialties"></div>',
    `<div class="public-specialties" id="photographerSpecialties">${profile.specialties.map((item) => `<span>${escapeHtml(SPECIALTY_LABELS[item] || item)}</span>`).join('')}</div>`
  );
  if (profile.profilePic) {
    html = html
      .replace('<img id="photographerImage" alt="" hidden>', `<img id="photographerImage" src="${escapeHtml(profile.profilePic)}" alt="Retrato de ${escapeHtml(profile.name)}">`)
      .replace('<span id="photographerInitials" aria-hidden="true">', '<span id="photographerInitials" aria-hidden="true" hidden>');
  }
  return html;
}

export function renderMissingProfilePage(template) {
  return template
    .replace('<!-- LENSCLICK_SSR_HEAD -->', '<meta name="robots" content="noindex">')
    .replace('<div class="profile-loading" id="profileLoading" role="status">', '<div class="profile-loading" id="profileLoading" role="status" hidden>')
    .replace('<section class="profile-error" id="profileError" hidden', '<section class="profile-error" id="profileError"');
}

const SITE_NAME = 'LensClick';
const SITE_LOCALE = 'pt_BR';
// Imagem social padrao. A marca definitiva (1200x630 propria) e o item de
// design pendente; ate la, reaproveita a foto do hero, que ja e a imagem de
// maior destaque da home e esta permitida pela CSP.
const OG_IMAGE_PATH = null;
const OG_IMAGE_FALLBACK = 'https://images.unsplash.com/photo-1542038784456-1ea8e935640e?q=80&w=1200&h=630&fit=crop&auto=format';
const OG_IMAGE_WIDTH = '1200';
const OG_IMAGE_HEIGHT = '630';
const OG_IMAGE_ALT = 'LensClick - encontre fotografos profissionais perto de voce';

// Paginas estaticas do site.
//
// A CHAVE e a URL limpa, que e a que o Cloudflare Assets serve de fato: o
// pedido de `/busca.html` responde 307 para `/busca`. Como `run_worker_first`
// (ver `wrangler.jsonc`) e o que decide quais requisicoes chegam ao Worker,
// a URL limpa e a unica que carrega os metadados: indexar a variante `.html`
// indexaria uma URL que redireciona.
//
// `file` e o asset em `public/` que o Assets entrega para a URL limpa.
//
// Politica de metadados: o Worker e a fonte unica de verdade do que e
// servido. Os arquivos HTML carregam apenas a `meta description` (texto-fonte,
// em PT-BR), que e lida e propagada para og:description e JSON-LD.
//
// Duplicar canonical ou og:* nos arquivos seria danoso: o Google ignora dois
// `rel="canonical"` conflitantes, e cada rede social le a primeira ou a
// ultima ocorrencia de og:image, o que produziria previews divergentes.
//
// `canonical` e sempre um PATH (nunca a URL da requisicao): assim o host
// canonico acompanha o dominio proprio (5.8.c) sem nenhuma alteracao de codigo
// e a query string nunca vira canonical.
export const STATIC_PAGES = new Map([
  ['/', { file: 'index.html', canonical: '/', ogType: 'website', schema: 'website' }],
  ['/busca', { file: 'busca.html', canonical: '/busca', ogType: 'website', schema: 'collection' }],
  ['/termos', { file: 'termos.html', canonical: '/termos', ogType: 'article', schema: 'webpage' }],
  ['/privacidade', { file: 'privacidade.html', canonical: '/privacidade', ogType: 'article', schema: 'webpage' }],
  ['/cadastro', { file: 'cadastro.html', indexable: false }],
  ['/login', { file: 'login.html', indexable: false }],
  ['/recuperar-senha', { file: 'recuperar-senha.html', indexable: false }],
  ['/redefinir-senha', { file: 'redefinir-senha.html', indexable: false }],
  ['/verificar-email', { file: 'verificar-email.html', indexable: false }],
  ['/admin', { file: 'admin.html', private: true }],
  ['/perfil', { file: 'perfil.html', private: true }],
  ['/perfil_temp', { file: 'perfil_temp.html', private: true, redirectTo: '/perfil' }],
  ['/fotografo', { file: 'fotografo.html', private: true }]
]);

// Variante `.html` de cada pagina -> URL limpa (ou destino final, quando a
// pagina e um redirect). O Assets responde 307 para a forma limpa; o Worker
// responde 301, que e o status correto para um movimento permanente.
const STATIC_PAGE_ALIASES = new Map(
  [...STATIC_PAGES.entries()]
    .filter(([path]) => path !== '/')
    .map(([path, page]) => [`/${page.file}`, page.redirectTo || path])
);

// Páginas privadas: nunca indexaveis nem rastreaveis. Recebem noindex por
// header (X-Robots-Tag) porque crawlers que ignoram robots.txt ainda assim
// nao devem indexar a area de administracao.
function isPrivatePage(pathname) {
  return STATIC_PAGES.get(pathname)?.private === true;
}

function readHeadField(html, pattern, fallback) {
  const match = html.match(pattern);
  return match ? String(match[1]).replace(/<[^>]+>/g, '').trim() : fallback;
}

// Constroi o destino de um redirect preservando a query string da requisicao.
// Sem isso, `/perfil.html?conversa=123` viraria `/perfil` e o parametro
// seria perdido no caminho.
function withQuery(path, requestUrl) {
  const source = new URL(requestUrl);
  const target = new URL(path, source);
  target.search = source.search;
  return target;
}

function buildStructuredData(policy, { title, description, canonicalUrl, siteUrl }) {
  const organizationId = `${siteUrl}#organization`;
  const websiteId = `${siteUrl}#website`;
  const organization = {
    '@type': 'Organization',
    '@id': organizationId,
    name: SITE_NAME,
    url: siteUrl,
    description
  };
  if (policy.schema === 'website') {
    return {
      '@context': 'https://schema.org',
      '@graph': [
        organization,
        {
          '@type': 'WebSite',
          '@id': websiteId,
          name: SITE_NAME,
          url: siteUrl,
          inLanguage: 'pt-BR',
          description,
          publisher: { '@id': organizationId }
        },
        {
          '@type': 'WebPage',
          '@id': `${siteUrl}#webpage`,
          url: canonicalUrl,
          name: title,
          description,
          inLanguage: 'pt-BR',
          isPartOf: { '@id': websiteId },
          about: { '@id': organizationId }
        }
      ]
    };
  }
  if (policy.schema === 'collection') {
    return {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: title,
      description,
      url: canonicalUrl,
      inLanguage: 'pt-BR',
      isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: siteUrl },
      publisher: { '@type': 'Organization', name: SITE_NAME, url: siteUrl }
    };
  }
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    description,
    url: canonicalUrl,
    inLanguage: 'pt-BR',
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: siteUrl },
    publisher: { '@type': 'Organization', name: SITE_NAME, url: siteUrl }
  };
}

function renderStaticPageMetadata(html, requestUrl) {
  const url = new URL(requestUrl);
  const policy = STATIC_PAGES.get(url.pathname);
  if (!policy || policy.private) return html;

  const siteUrl = new URL('/', requestUrl).toString();
  const title = readHeadField(html, /<title[^>]*>([\s\S]*?)<\/title>/i, SITE_NAME);
  const description = readHeadField(
    html,
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i,
    'Encontre fotografos profissionais e apresente seu trabalho na LensClick.'
  );
  const canonicalUrl = new URL(policy.canonical || '/', requestUrl).toString();
  const ogImage = OG_IMAGE_PATH ? new URL(OG_IMAGE_PATH, requestUrl).toString() : OG_IMAGE_FALLBACK;

  const head = [];
  if (policy.indexable === false) {
    // Paginas de autenticacao: nao competem em busca e nao devem ser
    // indexadas. `follow` preserva o sinal dos links do rodape.
    head.push('<meta name="robots" content="noindex, follow">');
  } else {
    head.push(`<link rel="canonical" href="${escapeHtml(canonicalUrl)}">`);
  }
  head.push(
    `<meta property="og:type" content="${policy.ogType || 'website'}">`,
    `<meta property="og:site_name" content="${SITE_NAME}">`,
    `<meta property="og:locale" content="${SITE_LOCALE}">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:url" content="${escapeHtml(canonicalUrl)}">`,
    `<meta property="og:image" content="${escapeHtml(ogImage)}">`,
    `<meta property="og:image:width" content="${OG_IMAGE_WIDTH}">`,
    `<meta property="og:image:height" content="${OG_IMAGE_HEIGHT}">`,
    `<meta property="og:image:alt" content="${escapeHtml(OG_IMAGE_ALT)}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${escapeHtml(title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(description)}">`,
    `<meta name="twitter:image" content="${escapeHtml(ogImage)}">`,
    `<meta name="twitter:image:alt" content="${escapeHtml(OG_IMAGE_ALT)}">`
  );
  if (policy.indexable !== false) {
    const structuredData = buildStructuredData(policy, { title, description, canonicalUrl, siteUrl });
    head.push(`<script type="application/ld+json">${escapeJsonForHtml(structuredData)}</script>`);
  }
  return html.replace('</head>', `  ${head.join('\n  ')}\n</head>`);
}

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function randomToken(byteLength = 32) {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
    key,
    256
  );
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${bytesToBase64Url(salt)}$${bytesToBase64Url(new Uint8Array(bits))}`;
}

async function verifyPassword(password, storedHash) {
  const [algorithm, iterationValue, saltValue, hashValue] = String(storedHash).split('$');
  const iterations = Number(iterationValue);
  if (algorithm !== 'pbkdf2-sha256' || !Number.isInteger(iterations) || iterations < 1 || !saltValue || !hashValue) return false;
  try {
    const salt = base64UrlToBytes(saltValue);
    const expected = base64UrlToBytes(hashValue);
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, expected.length * 8);
    const actual = new Uint8Array(bits);
    if (actual.length !== expected.length) return false;
    let difference = 0;
    for (let index = 0; index < actual.length; index += 1) difference |= actual[index] ^ expected[index];
    return difference === 0;
  } catch {
    return false;
  }
}

function parseCookies(request) {
  return Object.fromEntries(
    String(request.headers.get('Cookie') || '')
      .split(';')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const index = entry.indexOf('=');
        return index < 0 ? [entry, ''] : [entry.slice(0, index), decodeURIComponent(entry.slice(index + 1))];
      })
  );
}

function sessionCookie(token, request, maxAge = Math.floor(SESSION_TTL_MS / 1000)) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function responseHeaders(extra = {}) {
  return { ...SECURITY_HEADERS, ...extra };
}

function json(status, body, extraHeaders = {}) {
  return Response.json(body, {
    status,
    headers: responseHeaders({ 'Cache-Control': 'no-store', ...extraHeaders })
  });
}

async function readJson(request) {
  if (!String(request.headers.get('Content-Type') || '').toLowerCase().startsWith('application/json')) {
    throw Object.assign(new Error('Envie os dados no formato JSON.'), { status: 415 });
  }
  const declaredSize = Number(request.headers.get('Content-Length') || 0);
  if (declaredSize > MAX_BODY_BYTES) throw Object.assign(new Error('Payload muito grande.'), { status: 413 });
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw Object.assign(new Error('Payload muito grande.'), { status: 413 });
  }
  try {
    return JSON.parse(text || '{}');
  } catch {
    throw Object.assign(new Error('JSON invalido.'), { status: 400 });
  }
}

function requestOriginIsAllowed(request) {
  const origin = request.headers.get('Origin');
  return Boolean(origin) && origin === new URL(request.url).origin;
}

function publicUser(row) {
  return {
    id: Number(row.id),
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    age: row.age == null ? null : Number(row.age),
    gender: row.gender,
    emailVerified: row.email_verified_at != null && row.email_verified_at !== '',
    isAdmin: Number(row.is_admin || 0) === 1,
    profilePic: row.profile_pic_key
      ? `/api/profile-picture/${row.id}?v=${encodeURIComponent(row.updated_at || '')}`
      : ''
  };
}

function professionalProfile(row, ownerView = false) {
  if (!row) return null;
  const base = {
    slug: row.slug,
    bio: row.bio || '',
    specialties: storedSpecialties(row.specialties),
    city: row.city || '',
    state: row.state || '',
    serviceRadiusKm: row.service_radius_km == null ? null : Number(row.service_radius_km),
    startingPriceCents: row.starting_price_cents == null ? null : Number(row.starting_price_cents),
    availability: row.availability || 'available',
    ratingAverage: row.rating_average == null ? null : Number(row.rating_average),
    reviewCount: Number(row.review_count || 0),
    instagram: row.instagram || '',
    website: row.website || '',
    isPublished: Boolean(row.is_published)
  };
  if (ownerView) {
    return {
      ...base,
      publicEmail: row.public_email || '',
      publicPhone: row.public_phone || '',
      showEmail: Boolean(row.show_email),
      showPhone: Boolean(row.show_phone)
    };
  }
  return {
    ...base,
    name: row.name,
    profilePic: row.profile_pic_key ? `/api/photographers/${encodeURIComponent(row.slug)}/photo?v=${encodeURIComponent(row.user_updated_at || '')}` : '',
    contacts: {
      email: row.show_email ? row.public_email || '' : '',
      phone: row.show_phone ? row.public_phone || '' : ''
    }
  };
}

function portfolioItem(row, slug = '') {
  const id = Number(row.id);
  return {
    id,
    caption: row.caption || '',
    altText: row.alt_text || '',
    position: Number(row.position),
    isCover: Boolean(row.is_cover),
    category: row.category || 'other',
    imageUrl: slug
      ? `/api/photographers/${encodeURIComponent(slug)}/portfolio/${id}?v=${encodeURIComponent(row.updated_at || '')}`
      : `/api/account/portfolio/${id}/image?v=${encodeURIComponent(row.updated_at || '')}`
  };
}

function publicReview(row) {
  return {
    id: Number(row.id),
    rating: Number(row.rating),
    comment: row.comment || '',
    clientName: row.client_name || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function accountReviewRequest(row, role) {
  const base = {
    id: Number(row.id), message: row.message, status: row.status,
    createdAt: row.created_at, confirmedAt: row.confirmed_at || null,
    review: row.review_id ? {
      id: Number(row.review_id), rating: Number(row.review_rating),
      comment: row.review_comment || '', status: row.review_status
    } : null
  };
  return role === 'photographer'
    ? { ...base, clientName: row.client_name }
    : { ...base, photographerName: row.photographer_name, photographerSlug: row.photographer_slug };
}

function conversationSummary(row, currentUserId) {
  const isClient = Number(row.client_user_id) === Number(currentUserId);
  return {
    id: Number(row.id),
    status: row.status,
    lastMessageAt: row.last_message_at,
    updatedAt: row.updated_at,
    unreadCount: Number(row.unread_count || 0),
    lastMessage: row.last_message || '',
    counterpart: {
      id: Number(isClient ? row.photographer_user_id : row.client_user_id),
      name: isClient ? row.photographer_name : row.client_name,
      role: isClient ? 'photographer' : 'client',
      slug: isClient ? row.photographer_slug || '' : ''
    }
  };
}

function accountMessage(row) {
  return {
    id: Number(row.id),
    conversationId: Number(row.conversation_id),
    senderUserId: Number(row.sender_user_id),
    body: row.body,
    readAt: row.read_at || null,
    createdAt: row.created_at
  };
}

async function portfolioUpload(request) {
  const contentType = String(request.headers.get('Content-Type') || '').toLowerCase();
  if (!contentType.startsWith('multipart/form-data')) {
    throw Object.assign(new Error('Envie a imagem como formulario.'), { status: 415 });
  }
  const declaredSize = Number(request.headers.get('Content-Length') || 0);
  if (declaredSize > MAX_PORTFOLIO_IMAGE_BYTES + 100_000) {
    throw Object.assign(new Error('A imagem deve ter no maximo 4 MB.'), { status: 413 });
  }
  const form = await request.formData();
  const file = form.get('image');
  const altText = cleanText(form.get('altText'), 160);
  const caption = cleanText(form.get('caption'), 240);
  if (!(file instanceof File) || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw Object.assign(new Error('Escolha uma imagem JPG, PNG ou WebP.'), { status: 400 });
  }
  if (file.size < 1 || file.size > MAX_PORTFOLIO_IMAGE_BYTES) {
    throw Object.assign(new Error('A imagem deve ter no maximo 4 MB.'), { status: 413 });
  }
  if (altText.length < 3) {
    throw Object.assign(new Error('Descreva a imagem para acessibilidade.'), { status: 400 });
  }
  const extension = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1];
  return { bytes: await file.arrayBuffer(), contentType: file.type, extension, altText, caption };
}

async function storedImageResponse(object, request, cacheControl) {
  if (!object) return json(404, { error: 'Imagem nao encontrada.' });
  const headers = new Headers(responseHeaders({ 'Cache-Control': cacheControl }));
  if (typeof object.writeHttpMetadata === 'function') object.writeHttpMetadata(headers);
  if (!headers.has('Content-Type')) headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
  if (object.httpEtag) headers.set('ETag', object.httpEtag);
  if (object.httpEtag && request.headers.get('If-None-Match') === object.httpEtag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(object.body, { headers });
}

async function authenticatedUser(request, env) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return null;
  return env.DB.prepare(`
    SELECT u.*, s.token_hash AS authenticated_session_hash FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `).bind(await sha256(token), Date.now()).first();
}

async function createSession(userId, request, env) {
  return createSessionWithKind(userId, 'web', MAX_ACTIVE_WEB_SESSIONS, env, (token) => sessionCookie(token, request));
}

async function createMobileSession(userId, env) {
  return createSessionWithKind(userId, 'mobile', MAX_ACTIVE_MOBILE_SESSIONS, env, null);
}

async function createSessionWithKind(userId, kind, maxActive, env, wrapSession) {
  const token = randomToken();
  const tokenHash = await sha256(token);
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now),
    env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, kind) VALUES (?, ?, ?, ?)')
      .bind(tokenHash, userId, expiresAt, kind),
    env.DB.prepare(`
      DELETE FROM sessions
      WHERE user_id = ? AND kind = ? AND token_hash <> ?
        AND token_hash NOT IN (
          SELECT token_hash FROM sessions
          WHERE user_id = ? AND kind = ? AND token_hash <> ?
          ORDER BY expires_at DESC, created_at DESC, token_hash DESC
          LIMIT ?
        )
    `).bind(userId, kind, tokenHash, userId, kind, tokenHash, maxActive - 1)
  ]);
  if (wrapSession) return wrapSession(token);
  return { token, expiresAt };
}

function bearerToken(request) {
  const value = String(request.headers.get('Authorization') || '');
  const match = /^Bearer\s+([A-Za-z0-9_-]{40,200})$/.exec(value);
  return match ? match[1] : '';
}

async function authenticatedMobileUser(request, env) {
  const token = bearerToken(request);
  if (!token) return null;
  return env.DB.prepare(`
    SELECT u.*, s.token_hash AS authenticated_session_hash
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `).bind(await sha256(token), Date.now()).first();
}

async function revokeMobileSession(request, env) {
  const token = bearerToken(request);
  if (!token) return false;
  const result = await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
  return Number(result?.meta?.changes || 0) > 0;
}

async function consumeRateLimit(env, key, limit, intervalMs) {
  const now = Date.now();
  const bucket = Math.floor(now / intervalMs);
  const bucketKey = await sha256(`${key}\0${bucket}`);
  await env.DB.prepare('DELETE FROM rate_limits WHERE expires_at <= ?').bind(now).run();
  const record = await env.DB.prepare(`
    INSERT INTO rate_limits (bucket_key, request_count, expires_at)
    VALUES (?, 1, ?)
    ON CONFLICT(bucket_key) DO UPDATE SET request_count = request_count + 1
    RETURNING request_count
  `).bind(bucketKey, (bucket + 1) * intervalMs).first();
  return Number(record?.request_count || 0) > limit;
}

async function consumeEdgeRateLimit(limiter, key) {
  if (!limiter || typeof limiter.limit !== 'function') return false;
  try {
    const result = await limiter.limit({ key: await sha256(key) });
    return result?.success === false;
  } catch {
    // The existing D1 policy remains the authoritative fallback during migration.
    return false;
  }
}

async function isRateLimited(request, env, scope, limit, intervalMs, edgeLimiter) {
  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For')?.split(',')[0].trim() || 'local';
  const key = `lensclick\0${scope}\0${ip}`;
  if (await consumeEdgeRateLimit(edgeLimiter, key)) return true;
  return consumeRateLimit(env, key, limit, intervalMs);
}

async function sendPasswordResetEmail(env, recipient, name, resetUrl, language = 'pt') {
  if (!env.BREVO_API_KEY || !env.BREVO_SENDER_EMAIL) {
    throw new Error('Password reset email is not configured.');
  }
  const safeName = escapeHtml(name || '');
  const safeUrl = escapeHtml(resetUrl);
  const english = language === 'en';
  const subject = english ? 'Reset your LensClick password' : 'Redefina sua senha da LensClick';
  const text = english
    ? `Hello${name ? `, ${name}` : ''}. Use this link to reset your LensClick password: ${resetUrl}\n\nThe link expires in 30 minutes and can be used only once. If you did not request this change, ignore this email.`
    : `Ola${name ? `, ${name}` : ''}. Use este link para redefinir sua senha da LensClick: ${resetUrl}\n\nO link expira em 30 minutos e pode ser usado somente uma vez. Se voce nao solicitou a alteracao, ignore este e-mail.`;
  const html = english
    ? `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#17182a"><h1 style="font-size:24px">Reset your password</h1><p>Hello${safeName ? `, ${safeName}` : ''}.</p><p>We received a request to change your LensClick account password.</p><p><a href="${safeUrl}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#6f4cff;color:#fff;text-decoration:none;font-weight:700">Create a new password</a></p><p>The link expires in 30 minutes and can be used only once.</p><p>If you did not request this change, ignore this email.</p></div>`
    : `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#17182a"><h1 style="font-size:24px">Redefina sua senha</h1><p>Ola${safeName ? `, ${safeName}` : ''}.</p><p>Recebemos uma solicitacao para alterar a senha da sua conta LensClick.</p><p><a href="${safeUrl}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#6f4cff;color:#fff;text-decoration:none;font-weight:700">Criar nova senha</a></p><p>O link expira em 30 minutos e pode ser usado somente uma vez.</p><p>Se voce nao solicitou a alteracao, ignore este e-mail.</p></div>`;
  const emailFetch = typeof env.BREVO_FETCH === 'function' ? env.BREVO_FETCH : fetch;
  const response = await emailFetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'api-key': env.BREVO_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      sender: {
        name: env.BREVO_SENDER_NAME || 'LensClick',
        email: env.BREVO_SENDER_EMAIL
      },
      to: [{ email: recipient, ...(name ? { name } : {}) }],
      subject,
      textContent: text,
      htmlContent: html
    })
  });
  if (!response.ok) {
    throw new Error(`Brevo rejected password reset email (${response.status}).`);
  }
}

async function sendVerificationEmail(env, recipient, name, verifyUrl, language = 'pt') {
  if (!env.BREVO_API_KEY || !env.BREVO_SENDER_EMAIL) {
    throw new Error('Verification email is not configured.');
  }
  const safeName = escapeHtml(name || '');
  const safeUrl = escapeHtml(verifyUrl);
  const english = language === 'en';
  const subject = english ? 'Confirm your LensClick email' : 'Confirme seu e-mail da LensClick';
  const text = english
    ? `Hello${name ? `, ${name}` : ''}. Use this link to confirm your LensClick email: ${verifyUrl}\n\nThe link expires in 24 hours and can be used only once. If you did not create this account, ignore this email.`
    : `Ola${name ? `, ${name}` : ''}. Use este link para confirmar seu e-mail da LensClick: ${verifyUrl}\n\nO link expira em 24 horas e pode ser usado somente uma vez. Se voce nao criou esta conta, ignore este e-mail.`;
  const html = english
    ? `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#17182a"><h1 style="font-size:24px">Confirm your email</h1><p>Hello${safeName ? `, ${safeName}` : ''}.</p><p>We received a LensClick signup with this email address.</p><p><a href="${safeUrl}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#6f4cff;color:#fff;text-decoration:none;font-weight:700">Confirm my email</a></p><p>The link expires in 24 hours and can be used only once.</p><p>If you did not create this account, ignore this email.</p></div>`
    : `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#17182a"><h1 style="font-size:24px">Confirme seu e-mail</h1><p>Ola${safeName ? `, ${safeName}` : ''}.</p><p>Recebemos um cadastro na LensClick com este endereco de e-mail.</p><p><a href="${safeUrl}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#6f4cff;color:#fff;text-decoration:none;font-weight:700">Confirmar meu e-mail</a></p><p>O link expira em 24 horas e pode ser usado somente uma vez.</p><p>Se voce nao criou esta conta, ignore este e-mail.</p></div>`;
  const emailFetch = typeof env.BREVO_FETCH === 'function' ? env.BREVO_FETCH : fetch;
  const response = await emailFetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'api-key': env.BREVO_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      sender: {
        name: env.BREVO_SENDER_NAME || 'LensClick',
        email: env.BREVO_SENDER_EMAIL
      },
      to: [{ email: recipient, ...(name ? { name } : {}) }],
      subject,
      textContent: text,
      htmlContent: html
    })
  });
  if (!response.ok) {
    throw new Error(`Brevo rejected verification email (${response.status}).`);
  }
}

function decodeProfilePicture(dataUrl) {
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/i.exec(String(dataUrl));
  if (!match) throw Object.assign(new Error('Formato de imagem nao permitido.'), { status: 400 });
  let binary;
  try {
    binary = atob(match[2]);
  } catch {
    throw Object.assign(new Error('Imagem invalida.'), { status: 400 });
  }
  if (binary.length > MAX_PROFILE_PICTURE_BYTES) {
    throw Object.assign(new Error('A imagem deve ter no maximo 450 KB.'), { status: 413 });
  }
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const type = match[1].toLowerCase();
  return {
    bytes,
    contentType: type === 'jpeg' ? 'image/jpeg' : `image/${type}`,
    extension: type === 'jpeg' ? 'jpg' : type
  };
}

const authHandlers = createAuthHandlers({
  json, cleanText, normalizeEmail, isValidEmail, isValidPassword,
  isRateLimited, readJson, hashPassword, verifyPassword, createSession, createMobileSession,
  publicUser, consumeRateLimit, randomToken, sha256, sendPasswordResetEmail,
  sendVerificationEmail, authenticatedUser, authenticatedMobileUser, revokeMobileSession,
  parseCookies, sessionCookie, reportOperationalError,
  sessionCookieName: SESSION_COOKIE, passwordResetTtlMs: PASSWORD_RESET_TTL_MS,
  emailVerificationTtlMs: EMAIL_VERIFICATION_TTL_MS
});

const imageService = createImageService({ storedImageResponse });
const adminHandlers = createAdminHandlers({ json, cleanText, readJson, isRateLimited, authenticatedUser });
const monitoring = createMonitoringHandlers({ reportOperationalError });

const photographerHandlers = createPhotographerHandlers({
  json, cleanText, professionalProfile, portfolioItem,
  professionalSpecialties: PROFESSIONAL_SPECIALTIES, publicReview, responsiveImage: imageService.responsiveImage,
  isRateLimited, authenticatedUser, readJson, slugify,
  normalizeEmail, isValidEmail, normalizeWebsite, parseSpecialties, accountReviewRequest
});
const accountHandlers = createAccountHandlers({ json, authenticatedUser, isRateLimited, readJson, conversationSummary, accountMessage, portfolioItem });
const publicInputHandlers = createPublicInputHandlers({ json, isRateLimited, readJson, cleanText, normalizeEmail, isValidEmail });
const portfolioHandlers = createPortfolioHandlers({ json, cleanText, authenticatedUser, isRateLimited, readJson, portfolioItem, responsiveImage: imageService.responsiveImage });
const accountSecurityHandlers = createAccountSecurityHandlers({ json, cleanText, normalizeEmail, isValidEmail, authenticatedUser, readJson, verifyPassword, decodeProfilePicture, isValidPassword, hashPassword, publicUser, responsiveImage: imageService.responsiveImage, sessionCookie, isRateLimited, reportOperationalError, authRateLimit: [8, 15 * 60 * 1000], sensitiveRateLimit: [5, 60 * 60 * 1000] });

// Route matching lives in router.mjs. Domain handlers receive dependencies explicitly
// so extraction does not change business logic or request-scoped state.
async function dispatchApiRoute(routeId, params, request, env, url, context, requestContext) {
  const { pathname } = url;

  if (routeId === 'health') {
    try {
      const databaseCheck = await env.DB.prepare('SELECT 1 AS ok').first('ok');
      if (Number(databaseCheck) !== 1) throw new Error('D1 health check returned an unexpected result.');
      return json(200, { status: 'ok', checks: { database: 'ok' } });
    } catch {
      reportOperationalError(requestContext, 'database.health_check.failed', 'database_error');
      return json(503, { status: 'unavailable' });
    }
  }

  if (routeId === 'auth.register') return authHandlers.register({ request, env, pathname });
  if (routeId === 'auth.login') return authHandlers.login({ request, env, pathname });
  if (routeId === 'auth.mobile.login') return authHandlers.mobileLogin({ request, env, pathname });
  if (routeId === 'auth.mobile.me') return authHandlers.mobileMe({ request, env });
  if (routeId === 'auth.mobile.logout') return authHandlers.mobileLogout({ request, env });
  if (routeId === 'auth.password-reset.request') return authHandlers.passwordResetRequest({ request, env, pathname, context, requestContext });
  if (routeId === 'auth.password-reset.confirm') return authHandlers.passwordResetConfirm({ request, env, pathname });
  if (routeId === 'auth.email.verify') return authHandlers.emailVerify({ request, env, pathname });
  if (routeId === 'auth.email.resend') return authHandlers.emailResend({ request, env, pathname, context, requestContext });
  if (routeId === 'auth.logout') return authHandlers.logout({ request, env });
  if (routeId === 'auth.me') return authHandlers.me({ request, env });
  if (routeId === 'admin.overview') return adminHandlers.overview({ request, env, pathname });
  if (routeId === 'admin.reviews.list') return adminHandlers.reviewsList({ request, env, url, pathname });
  if (routeId === 'admin.reviews.update') return adminHandlers.reviewUpdate({ params, request, env, pathname });
  if (routeId === 'admin.conversations.list') return adminHandlers.conversationsList({ request, env, url, pathname });
  if (routeId === 'admin.conversations.update') return adminHandlers.conversationUpdate({ params, request, env, pathname });
  if (routeId.startsWith('admin.')) {
    const gate = await adminHandlers.requireAdmin(request, env, pathname);
    if (!gate.user) return gate.response;
    return json(404, { error: 'Endpoint nao encontrado.' });
  }
  if (routeId === 'photographers.list') return photographerHandlers.list({ request, env });
  if (routeId === 'photographers.detail') return photographerHandlers.detail({ params, env });
  if (routeId === 'photographers.photo') return photographerHandlers.photo({ params, env, request });
  if (routeId === 'photographers.portfolio-image') return photographerHandlers.portfolioImage({ params, env, request });
  if (routeId === 'photographers.reviews') return photographerHandlers.reviews({ params, env });
  if (routeId === 'photographers.review-request.create') return photographerHandlers.reviewRequestCreate({ params, request, env, pathname });
  if (routeId === 'photographers.conversations.create') return photographerHandlers.conversationCreate({ params, request, env, pathname });
  if (routeId === 'account.professional-profile.read') return photographerHandlers.professionalProfileRead({ request, env });
  if (routeId === 'account.professional-profile.update') return photographerHandlers.professionalProfileUpdate({ request, env, pathname });
  if (routeId === 'account.review-requests.list') return photographerHandlers.reviewRequestsList({ request, env });
  if (routeId === 'account.review-requests.update') return photographerHandlers.reviewRequestUpdate({ params, request, env, pathname });
  if (routeId === 'account.reviews.create') return photographerHandlers.reviewCreate({ params, request, env, pathname });
  if (routeId === 'account.reviews.update') return photographerHandlers.reviewUpdate({ params, request, env, pathname });
  if (routeId === 'account.reviews.delete') return photographerHandlers.reviewDelete({ params, request, env, pathname });
  if (routeId === 'account.conversations.list') return accountHandlers.listConversations({ request, env, url });
  if (routeId === 'account.export') return accountHandlers.exportData({ request, env, pathname });
  if (routeId === 'account.conversations.messages') return accountHandlers.messages({ params, request, env, url });
  if (routeId === 'account.conversations.messages.create') return accountHandlers.createMessage({ params, request, env, pathname });
  if (routeId === 'account.conversations.read') return accountHandlers.markRead({ params, request, env });
  if (routeId === 'account.portfolio.list') return accountHandlers.portfolioList({ request, env });
  if (routeId === 'account.portfolio.create') return portfolioHandlers.create({ request, env, pathname });
  if (routeId === 'account.portfolio.update') return portfolioHandlers.update({ request, env });
  if (routeId === 'account.portfolio.image') return portfolioHandlers.image({ params, request, env });
  if (routeId === 'account.portfolio.delete') return portfolioHandlers.remove({ params, request, env });
  if (routeId === 'account.profile.update') return accountSecurityHandlers.profileUpdate({ request, env, requestContext });
  if (routeId === 'account.password.update') return accountSecurityHandlers.passwordUpdate({ request, env, pathname });
  if (routeId === 'account.photo.delete') return accountSecurityHandlers.photoDelete({ request, env });
  if (routeId === 'account.delete') return accountSecurityHandlers.accountDelete({ request, env, pathname });
  if (routeId === 'account.profile-picture') return accountSecurityHandlers.profilePicture({ params, request, env });
  if (routeId === 'contact.create') return publicInputHandlers.contact({ request, env, pathname });
  if (routeId === 'newsletter.create') return publicInputHandlers.newsletter({ request, env, pathname });

  return json(404, { error: 'Endpoint nao encontrado.' });
}

async function handleAssetRequest(request, env) {
  const url = new URL(request.url);
  if (['GET', 'HEAD'].includes(request.method) && url.pathname === '/robots.txt') {
    // As paginas de autenticacao NAO sao bloqueadas aqui: com `Disallow`, o
    // bot nao consegue baixar a pagina e portanto nao ve o `noindex`, o que
    // deixa a URL residindo no indice como "bloqueada por robots.txt". Com o
    // `noindex` no HTML, o bot le a diretiva e remove a URL. As areas privadas
    // seguem bloqueadas: nao queremos revelar a existencia do painel admin.
    const body = [
      'User-agent: *',
      'Allow: /',
      'Disallow: /api/',
      'Allow: /api/photographers/*/photo',
      'Disallow: /admin',
      'Disallow: /perfil',
      `Sitemap: ${new URL('/sitemap.xml', url).toString()}`,
      ''
    ].join('\n');
    return new Response(request.method === 'HEAD' ? null : body, {
      headers: new Headers({ ...responseHeaders({ 'Cache-Control': 'public, max-age=3600' }), 'Content-Type': 'text/plain; charset=UTF-8' })
    });
  }
  if (['GET', 'HEAD'].includes(request.method) && url.pathname === '/sitemap.xml') {
    const profiles = await env.DB.prepare(`
      SELECT p.slug, p.updated_at AS updated_at FROM professional_profiles p
      JOIN users u ON u.id = p.user_id
      WHERE p.is_published = 1 AND u.role = 'photographer'
      ORDER BY p.updated_at DESC, p.user_id DESC LIMIT 50000
    `).all();
    const urls = [
      { loc: new URL('/', url).toString() },
      { loc: new URL('/busca', url).toString() },
      { loc: new URL('/termos', url).toString() },
      { loc: new URL('/privacidade', url).toString() },
      ...(profiles.results || []).map((profile) => ({
        loc: new URL(`/fotografo/${encodeURIComponent(profile.slug)}`, url).toString(),
        lastmod: profile.updated_at
      }))
    ];
    const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(({ loc, lastmod }) => `  <url><loc>${escapeXml(loc)}</loc>${lastmod ? `<lastmod>${escapeXml(lastmod.replace(' ', 'T') + 'Z')}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`;
    return new Response(request.method === 'HEAD' ? null : body, {
      headers: new Headers({ ...responseHeaders({ 'Cache-Control': 'public, max-age=3600' }), 'Content-Type': 'application/xml; charset=UTF-8' })
    });
  }
  // `/index.html` e `/` sao a mesma pagina. Sem o 301, as duas seriam
  // indexaveis com canonical proprio (duplicacao de conteudo) e o sinal de
  // canonizacao se dividiria entre elas.
  if (['GET', 'HEAD'].includes(request.method) && url.pathname === '/index.html') {
    return Response.redirect(new URL('/', url), 301);
  }
  // A URL legada com slug e resolvida antes das variantes `.html`, para que
  // `/fotografo.html?perfil=ana-luz` chegue a rota canonica do perfil.
  const legacySlug = url.pathname === '/fotografo.html' ? url.searchParams.get('perfil') : '';
  if (['GET', 'HEAD'].includes(request.method) && /^[a-z0-9-]{3,80}$/.test(legacySlug || '')) {
    return Response.redirect(new URL(`/fotografo/${encodeURIComponent(legacySlug)}`, url), 301);
  }
  // A URL limpa e a canonica: as variantes `.html` sao movidas de forma
  // permanente para a forma limpa, que e a que o Assets serve de fato.
  // A query string e preservada: o destino pode depender dela (ex.:
  // `/perfil.html?conversa=123` -> `/perfil?conversa=123`).
  const cleanAlias = STATIC_PAGE_ALIASES.get(url.pathname);
  if (['GET', 'HEAD'].includes(request.method) && cleanAlias) {
    return Response.redirect(withQuery(cleanAlias, url), 301);
  }
  // Paginas que existem apenas para redirecionar (ex.: `/perfil_temp`).
  const pageRedirect = STATIC_PAGES.get(url.pathname)?.redirectTo;
  if (['GET', 'HEAD'].includes(request.method) && pageRedirect) {
    return Response.redirect(withQuery(pageRedirect, url), 301);
  }

  const profileRoute = url.pathname.match(/^\/fotografo\/([a-z0-9-]{3,80})\/?$/);
  if (['GET', 'HEAD'].includes(request.method) && profileRoute) {
    const slug = profileRoute[1];
    const [profile, templateResponse] = await Promise.all([
      env.DB.prepare(`
        SELECT p.*, u.name, u.profile_pic_key, u.updated_at AS user_updated_at
        FROM professional_profiles p
        JOIN users u ON u.id = p.user_id
        WHERE p.slug = ? AND p.is_published = 1 AND u.role = 'photographer'
      `).bind(slug).first(),
      env.ASSETS.fetch(new Request(new URL('/fotografo.html', url), {
        method: 'GET',
        headers: { Accept: 'text/html' }
      }))
    ]);
    const template = await templateResponse.text();
    const body = profile
      ? renderPublicProfilePage(template, profile, url)
      : renderMissingProfilePage(template);
    const headers = new Headers(templateResponse.headers);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
    headers.set('Content-Type', 'text/html; charset=UTF-8');
    headers.set('Cache-Control', profile ? 'public, max-age=60' : 'no-store');
    return new Response(request.method === 'HEAD' ? null : body, { status: profile ? 200 : 404, headers });
  }

  const assetResponse = await env.ASSETS.fetch(request);
  const headers = new Headers(assetResponse.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  if (headers.get('Content-Type')?.startsWith('text/html')) headers.set('Cache-Control', 'no-cache');
  if (isPrivatePage(url.pathname)) headers.set('X-Robots-Tag', 'noindex, nofollow');
  if (assetResponse.ok && headers.get('Content-Type')?.startsWith('text/html') && STATIC_PAGES.has(url.pathname)) {
    const html = await assetResponse.text();
    const body = renderStaticPageMetadata(html, url);
    return new Response(request.method === 'HEAD' ? null : body, { status: assetResponse.status, statusText: assetResponse.statusText, headers });
  }
  return new Response(assetResponse.body, { status: assetResponse.status, statusText: assetResponse.statusText, headers });
}

const router = createRequestRouter({
  dispatchApiRoute,
  handleAssetRequest,
  requestOriginIsAllowed,
  forbiddenResponse: () => json(403, { error: 'Origem da requisicao nao autorizada.' }),
  notFoundResponse: () => json(404, { error: 'Endpoint nao encontrado.' })
});

const EDGE_CACHE_ROUTES = new Set([
  '/api/photographers',
]);

function edgeCacheKey(request) {
  const url = new URL(request.url);
  return new Request(url.toString(), { method: 'GET' });
}

function isEdgeCacheable(request, response) {
  if (request.method.toUpperCase() !== 'GET' || response.status !== 200) return false;
  const url = new URL(request.url);
  const isList = EDGE_CACHE_ROUTES.has(url.pathname);
  const isProfile = /^\/api\/photographers\/[a-z0-9-]{3,80}$/.test(url.pathname);
  if (!isList && !isProfile) return false;
  const cacheControl = response.headers.get('Cache-Control') || '';
  return /(?:^|,\s*)public(?:,|$)/i.test(cacheControl)
    && !/(?:^|,\s*)(?:private|no-store)(?:,|$)/i.test(cacheControl)
    && !response.headers.has('Set-Cookie');
}

async function readEdgeCache(request) {
  if (!globalThis.caches?.default) return null;
  try {
    return await globalThis.caches.default.match(edgeCacheKey(request));
  } catch {
    return null;
  }
}

function writeEdgeCache(request, response, context) {
  if (!isEdgeCacheable(request, response) || !globalThis.caches?.default) return;
  const operation = globalThis.caches.default.put(edgeCacheKey(request), response.clone()).catch(() => undefined);
  if (context?.waitUntil) context.waitUntil(operation);
}

export default {
  async fetch(request, env, context) {
    const requestContext = createRequestContext(request, {
      sink: typeof env?.OBSERVABILITY_LOG_SINK === 'function' ? env.OBSERVABILITY_LOG_SINK : undefined
    });
    let response;
    let errorCategory;
    try {
      response = await readEdgeCache(request);
      if (!response) {
        response = await router.handleRequest(request, env, context, requestContext);
        writeEdgeCache(request, response, context);
      }
    } catch (error) {
      const status = Number(error?.status) || 500;
      errorCategory = errorCategoryForStatus(status);
      response = json(status, { error: status < 500 ? error.message : 'Nao foi possivel concluir a operacao.' });
    }
    const instrumentedResponse = responseWithRequestId(response, requestContext.requestId);
    completeRequest(requestContext, instrumentedResponse.status, { errorCategory });
    if (env?.DB && context?.waitUntil) {
      const event = buildRequestCompletedEvent(requestContext, instrumentedResponse.status);
      context.waitUntil(recordRequestSample(env, {
        durationMs: event.duration_ms,
        status: event.status,
        isApi: event.route.startsWith('/api/')
      }));
    }
    return instrumentedResponse;
  },
  async scheduled(event, env, context) {
    const requestContext = createRequestContext(new Request(new URL('https://lensclick.workers.dev/__scheduled')));
    try {
      await monitoring.runAvailabilityCheck({
        env,
        requestContext,
        probe: async (e) => {
          const check = await e.DB.prepare('SELECT 1 AS ok').first('ok');
          if (Number(check) !== 1) throw new Error('D1 health check returned an unexpected result.');
        }
      });
      await monitoring.runPerformanceCheck({ env, requestContext });
    } catch (error) {
      console.error('Monitoring probe failed:', error?.message || error);
    }
  }
};

import {
  completeRequest,
  createRequestContext,
  errorCategoryForStatus,
  reportOperationalError,
  responseWithRequestId
} from './observability.mjs';
import { createRequestRouter } from './router.mjs';
import { createAuthHandlers } from './auth.mjs';
import { createPhotographerHandlers } from './photographers.mjs';

const SESSION_COOKIE = 'lensclick_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;
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
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https://images.unsplash.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; script-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
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
  const token = randomToken();
  const now = Date.now();
  await env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now).run();
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(await sha256(token), userId, now + SESSION_TTL_MS)
    .run();
  return sessionCookie(token, request);
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
  isRateLimited, readJson, hashPassword, verifyPassword, createSession,
  publicUser, consumeRateLimit, randomToken, sha256, sendPasswordResetEmail,
  authenticatedUser, parseCookies, sessionCookie, reportOperationalError,
  sessionCookieName: SESSION_COOKIE, passwordResetTtlMs: PASSWORD_RESET_TTL_MS
});

const photographerHandlers = createPhotographerHandlers({
  json, cleanText, professionalProfile, portfolioItem,
  professionalSpecialties: PROFESSIONAL_SPECIALTIES, publicReview, storedImageResponse,
  isRateLimited, authenticatedUser, readJson
});

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
  if (routeId === 'auth.password-reset.request') return authHandlers.passwordResetRequest({ request, env, pathname, context, requestContext });
  if (routeId === 'auth.password-reset.confirm') return authHandlers.passwordResetConfirm({ request, env, pathname });
  if (routeId === 'auth.logout') return authHandlers.logout({ request, env });
  if (routeId === 'auth.me') return authHandlers.me({ request, env });
  if (routeId === 'photographers.list') return photographerHandlers.list({ request, env });
  if (routeId === 'photographers.detail') return photographerHandlers.detail({ params, env });
  if (routeId === 'photographers.photo') return photographerHandlers.photo({ params, env, request });
  if (routeId === 'photographers.portfolio-image') return photographerHandlers.portfolioImage({ params, env, request });
  if (routeId === 'photographers.reviews') return photographerHandlers.reviews({ params, env });
  if (routeId === 'photographers.review-request.create') return photographerHandlers.reviewRequestCreate({ params, request, env, pathname });
  if (routeId === 'photographers.conversations.create') return photographerHandlers.conversationCreate({ params, request, env, pathname });

  if (routeId === 'account.conversations.list') {
    const current = await authenticatedUser(request, env);
    if (!current) return json(401, { error: 'Faca login novamente.' });
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get('pageSize')) || 20));
    const offset = (page - 1) * pageSize;
    const total = Number((await env.DB.prepare(`
      SELECT COUNT(*) AS total FROM conversations WHERE client_user_id = ? OR photographer_user_id = ?
    `).bind(current.id, current.id).first())?.total || 0);
    const result = await env.DB.prepare(`
      SELECT c.*, client.name AS client_name, photographer.name AS photographer_name, p.slug AS photographer_slug,
        (SELECT body FROM messages WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1) AS last_message,
        (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND sender_user_id <> ? AND read_at IS NULL) AS unread_count
      FROM conversations c
      JOIN users client ON client.id = c.client_user_id
      JOIN users photographer ON photographer.id = c.photographer_user_id
      LEFT JOIN professional_profiles p ON p.user_id = c.photographer_user_id
      WHERE c.client_user_id = ? OR c.photographer_user_id = ?
      ORDER BY c.last_message_at DESC, c.id DESC LIMIT ? OFFSET ?
    `).bind(current.id, current.id, current.id, pageSize, offset).all();
    return json(200, {
      conversations: result.results.map((row) => conversationSummary(row, current.id)),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
    });
  }

  if (routeId === 'account.conversations.messages') {
    const current = await authenticatedUser(request, env);
    if (!current) return json(401, { error: 'Faca login novamente.' });
    const conversationId = Number(params[0]);
    const conversation = await env.DB.prepare(`
      SELECT id FROM conversations WHERE id = ? AND (client_user_id = ? OR photographer_user_id = ?)
    `).bind(conversationId, current.id, current.id).first();
    if (!conversation) return json(404, { error: 'Conversa nao encontrada.' });
    const before = Math.max(0, Number(url.searchParams.get('before')) || 0);
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize')) || 50));
    const result = await env.DB.prepare(`
      SELECT id, conversation_id, sender_user_id, body, read_at, created_at FROM messages
      WHERE conversation_id = ? AND (? = 0 OR id < ?)
      ORDER BY id DESC LIMIT ?
    `).bind(conversationId, before, before, pageSize + 1).all();
    const rows = result.results;
    const hasMore = rows.length > pageSize;
    const visible = rows.slice(0, pageSize);
    return json(200, {
      messages: visible.reverse().map(accountMessage),
      pagination: { hasMore, nextBefore: hasMore ? Number(visible[0].id) : null }
    });
  }

  if (routeId === 'account.conversations.messages.create') {
    if (await isRateLimited(request, env, pathname, 30, 60 * 60 * 1000, env.CONTENT_RATE_LIMITER)) {
      return json(429, { error: 'Limite de mensagens atingido. Tente mais tarde.' });
    }
    const current = await authenticatedUser(request, env);
    if (!current) return json(401, { error: 'Faca login novamente.' });
    const conversationId = Number(params[0]);
    const conversation = await env.DB.prepare(`
      SELECT id, status FROM conversations WHERE id = ? AND (client_user_id = ? OR photographer_user_id = ?)
    `).bind(conversationId, current.id, current.id).first();
    if (!conversation) return json(404, { error: 'Conversa nao encontrada.' });
    if (conversation.status !== 'active') return json(409, { error: 'Esta conversa esta encerrada.' });
    const body = String((await readJson(request)).message ?? '').trim();
    if (!body) return json(400, { error: 'Escreva uma mensagem antes de enviar.' });
    if (body.length > 2000) return json(400, { error: 'A mensagem deve ter no maximo 2000 caracteres.' });
    const results = await env.DB.batch([
      env.DB.prepare('INSERT INTO messages (conversation_id, sender_user_id, body) VALUES (?, ?, ?)')
        .bind(conversationId, current.id, body),
      env.DB.prepare('UPDATE conversations SET last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .bind(conversationId)
    ]);
    const messageId = Number(results[0]?.meta?.last_row_id || 0);
    const message = await env.DB.prepare(`
      SELECT id, conversation_id, sender_user_id, body, read_at, created_at FROM messages WHERE id = ?
    `).bind(messageId).first();
    return json(201, { message: accountMessage(message) });
  }

  if (routeId === 'account.conversations.read') {
    const current = await authenticatedUser(request, env);
    if (!current) return json(401, { error: 'Faca login novamente.' });
    const conversationId = Number(params[0]);
    const conversation = await env.DB.prepare(`
      SELECT id FROM conversations WHERE id = ? AND (client_user_id = ? OR photographer_user_id = ?)
    `).bind(conversationId, current.id, current.id).first();
    if (!conversation) return json(404, { error: 'Conversa nao encontrada.' });
    const result = await env.DB.prepare(`
      UPDATE messages SET read_at = CURRENT_TIMESTAMP
      WHERE conversation_id = ? AND sender_user_id <> ? AND read_at IS NULL
    `).bind(conversationId, current.id).run();
    return json(200, { ok: true, updated: Number(result.meta?.changes || 0) });
  }

  if (routeId === 'account.review-requests.list') {
    const current = await authenticatedUser(request, env);
    if (!current) return json(401, { error: 'Faca login novamente.' });
    const query = current.role === 'photographer' ? `
      SELECT q.*, u.name AS client_name, r.id AS review_id, r.rating AS review_rating,
        r.comment AS review_comment, r.status AS review_status
      FROM review_requests q JOIN users u ON u.id = q.client_user_id
      LEFT JOIN reviews r ON r.request_id = q.id
      WHERE q.photographer_user_id = ? ORDER BY q.created_at DESC, q.id DESC
    ` : `
      SELECT q.*, u.name AS photographer_name, p.slug AS photographer_slug,
        r.id AS review_id, r.rating AS review_rating, r.comment AS review_comment, r.status AS review_status
      FROM review_requests q JOIN users u ON u.id = q.photographer_user_id
      JOIN professional_profiles p ON p.user_id = q.photographer_user_id
      LEFT JOIN reviews r ON r.request_id = q.id
      WHERE q.client_user_id = ? ORDER BY q.created_at DESC, q.id DESC
    `;
    const result = await env.DB.prepare(query).bind(current.id).all();
    return json(200, { role: current.role, requests: result.results.map((row) => accountReviewRequest(row, current.role)) });
  }

  if (routeId === 'account.review-requests.update') {
    if (await isRateLimited(request, env, pathname, 20, 60 * 60 * 1000, env.ACCOUNT_RATE_LIMITER)) {
      return json(429, { error: 'Muitas alteracoes. Aguarde antes de tentar novamente.' });
    }
    const [requestId] = params;
    const current = await authenticatedUser(request, env);
    if (!current) return json(401, { error: 'Faca login novamente.' });
    if (current.role !== 'photographer') return json(403, { error: 'Somente o fotografo pode confirmar este contato.' });
    const body = await readJson(request);
    const status = ['confirmed', 'rejected'].includes(body.status) ? body.status : '';
    if (!status) return json(400, { error: 'Escolha confirmar ou rejeitar a solicitacao.' });
    const existing = await env.DB.prepare(`SELECT id FROM review_requests WHERE id = ? AND photographer_user_id = ? AND status = 'pending'`)
      .bind(Number(requestId), current.id).first();
    if (!existing) return json(404, { error: 'Solicitacao pendente nao encontrada.' });
    await env.DB.prepare(`
      UPDATE review_requests SET status = ?, confirmed_at = CASE WHEN ? = 'confirmed' THEN CURRENT_TIMESTAMP ELSE NULL END,
        updated_at = CURRENT_TIMESTAMP WHERE id = ? AND photographer_user_id = ?
    `).bind(status, status, Number(requestId), current.id).run();
    return json(200, { message: status === 'confirmed' ? 'Contato confirmado. O cliente ja pode avaliar.' : 'Solicitacao rejeitada.' });
  }

  if (routeId === 'account.reviews.create') {
    if (await isRateLimited(request, env, pathname, 8, 60 * 60 * 1000, env.CONTENT_RATE_LIMITER)) {
      return json(429, { error: 'Muitas avaliacoes. Aguarde antes de tentar novamente.' });
    }
    const [requestId] = params;
    const current = await authenticatedUser(request, env);
    if (!current) return json(401, { error: 'Faca login novamente.' });
    if (current.role !== 'client') return json(403, { error: 'Somente clientes podem avaliar fotografos.' });
    const eligibility = await env.DB.prepare(`
      SELECT q.photographer_user_id, r.id AS review_id FROM review_requests q
      LEFT JOIN reviews r ON r.request_id = q.id
      WHERE q.id = ? AND q.client_user_id = ? AND q.status = 'confirmed'
    `).bind(Number(requestId), current.id).first();
    if (!eligibility) return json(403, { error: 'Este contato ainda nao esta confirmado para avaliacao.' });
    if (eligibility.review_id) return json(409, { error: 'Este contato ja possui uma avaliacao.' });
    const body = await readJson(request);
    const rating = Number(body.rating);
    const comment = cleanText(body.comment, 1000);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5 || comment.length < 10) {
      return json(400, { error: 'Informe uma nota de 1 a 5 e um comentario com pelo menos 10 caracteres.' });
    }
    const [inserted] = await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO reviews (request_id, client_user_id, photographer_user_id, rating, comment) VALUES (?, ?, ?, ?, ?)
      `).bind(Number(requestId), current.id, eligibility.photographer_user_id, rating, comment),
      env.DB.prepare(`
        INSERT INTO review_audit (review_id, actor_user_id, action, rating, comment)
        SELECT id, ?, 'created', ?, ? FROM reviews WHERE request_id = ?
      `).bind(current.id, rating, comment, Number(requestId))
    ]);
    const reviewId = Number(inserted.meta.last_row_id);
    return json(201, { review: { id: reviewId, rating, comment, status: 'active' }, message: 'Avaliacao publicada.' });
  }

  if (routeId === 'account.reviews.update') {
    if (await isRateLimited(request, env, pathname, 12, 60 * 60 * 1000, env.CONTENT_RATE_LIMITER)) {
      return json(429, { error: 'Muitas alteracoes de avaliacao. Aguarde antes de tentar novamente.' });
    }
    const [reviewId] = params;
    const current = await authenticatedUser(request, env);
    if (!current) return json(401, { error: 'Faca login novamente.' });
    const existing = await env.DB.prepare(`SELECT id FROM reviews WHERE id = ? AND client_user_id = ? AND status = 'active'`)
      .bind(Number(reviewId), current.id).first();
    if (!existing) return json(404, { error: 'Avaliacao ativa nao encontrada.' });
    const body = await readJson(request);
    const rating = Number(body.rating);
    const comment = cleanText(body.comment, 1000);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5 || comment.length < 10) {
      return json(400, { error: 'Informe uma nota de 1 a 5 e um comentario com pelo menos 10 caracteres.' });
    }
    await env.DB.batch([
      env.DB.prepare(`UPDATE reviews SET rating = ?, comment = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND client_user_id = ?`)
        .bind(rating, comment, Number(reviewId), current.id),
      env.DB.prepare(`INSERT INTO review_audit (review_id, actor_user_id, action, rating, comment) VALUES (?, ?, 'updated', ?, ?)`)
        .bind(Number(reviewId), current.id, rating, comment)
    ]);
    return json(200, { review: { id: Number(reviewId), rating, comment, status: 'active' }, message: 'Avaliacao atualizada.' });
  }

  if (routeId === 'account.reviews.delete') {
    if (await isRateLimited(request, env, pathname, 8, 60 * 60 * 1000, env.SENSITIVE_RATE_LIMITER)) {
      return json(429, { error: 'Muitas exclusoes. Aguarde antes de tentar novamente.' });
    }
    const [reviewId] = params;
    const current = await authenticatedUser(request, env);
    if (!current) return json(401, { error: 'Faca login novamente.' });
    const existing = await env.DB.prepare(`SELECT rating, comment FROM reviews WHERE id = ? AND client_user_id = ? AND status = 'active'`)
      .bind(Number(reviewId), current.id).first();
    if (!existing) return json(404, { error: 'Avaliacao ativa nao encontrada.' });
    await env.DB.batch([
      env.DB.prepare(`UPDATE reviews SET status = 'deleted', deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND client_user_id = ?`)
        .bind(Number(reviewId), current.id),
      env.DB.prepare(`INSERT INTO review_audit (review_id, actor_user_id, action, rating, comment) VALUES (?, ?, 'deleted', ?, ?)`)
        .bind(Number(reviewId), current.id, existing.rating, existing.comment)
    ]);
    return json(200, { message: 'Avaliacao removida e acao registrada.' });
  }

  if (routeId === 'account.portfolio.list') {
    const current = await authenticatedUser(request, env);
    if (!current) return json(401, { error: 'Faca login novamente.' });
    const portfolio = await env.DB.prepare(`
      SELECT id, caption, alt_text, position, updated_at FROM portfolio_items
      WHERE user_id = ? ORDER BY position, id
    `).bind(current.id).all();
    return json(200, { portfolio: portfolio.results.map((item) => portfolioItem(item)) });
  }

  if (routeId === 'account.portfolio.create') {
    if (await isRateLimited(request, env, pathname, 20, 60 * 60 * 1000, env.CONTENT_RATE_LIMITER)) {
      return json(429, { error: 'Muitos envios. Aguarde antes de tentar novamente.' });
    }
    const current = await authenticatedUser(request, env);
    if (!current) return json(401, { error: 'Faca login novamente.' });
    if (current.role !== 'photographer') return json(403, { error: 'Somente perfis de fotografo podem criar portfolio.' });
    const count = Number(await env.DB.prepare('SELECT COUNT(*) AS total FROM portfolio_items WHERE user_id = ?').bind(current.id).first('total'));
    if (count >= MAX_PORTFOLIO_ITEMS) return json(409, { error: 'Seu portfolio ja possui o limite de 12 imagens.' });
    const upload = await portfolioUpload(request);
    const objectKey = `portfolio/${current.id}/${crypto.randomUUID()}.${upload.extension}`;
    await env.PROFILE_IMAGES.put(objectKey, upload.bytes, { httpMetadata: { contentType: upload.contentType } });
    try {
      const result = await env.DB.prepare(`
        INSERT INTO portfolio_items (user_id, object_key, caption, alt_text, position)
        VALUES (?, ?, ?, ?, ?)
      `).bind(current.id, objectKey, upload.caption, upload.altText, count).run();
      const item = await env.DB.prepare(`
        SELECT id, caption, alt_text, position, updated_at FROM portfolio_items WHERE id = ? AND user_id = ?
      `).bind(Number(result.meta.last_row_id), current.id).first();
      return json(201, { item: portfolioItem(item), message: 'Imagem adicionada ao portfolio.' });
    } catch (error) {
      await env.PROFILE_IMAGES.delete(objectKey);
      throw error;
    }
  }

  if (routeId === 'account.portfolio.update') {
    const current = await authenticatedUser(request, env);
    if (!current) return json(401, { error: 'Faca login novamente.' });
    const body = await readJson(request);
    if (!Array.isArray(body.items) || body.items.length > MAX_PORTFOLIO_ITEMS) {
      return json(400, { error: 'Organizacao do portfolio invalida.' });
    }
    const ids = body.items.map((item) => Number(item.id));
    if (ids.some((id) => !Number.isInteger(id) || id < 1) || new Set(ids).size !== ids.length) {
      return json(400, { error: 'Organizacao do portfolio invalida.' });
    }
    if (ids.length) {
      const owned = await env.DB.prepare(`
        SELECT id FROM portfolio_items WHERE user_id = ? AND id IN (${ids.map(() => '?').join(',')})
      `).bind(current.id, ...ids).all();
      if (owned.results.length !== ids.length) return json(403, { error: 'Item de portfolio nao autorizado.' });
    }
    const statements = body.items.map((item, position) => {
      const altText = cleanText(item.altText, 160);
      if (altText.length < 3) throw Object.assign(new Error('Descreva todas as imagens para acessibilidade.'), { status: 400 });
      return env.DB.prepare(`
        UPDATE portfolio_items SET caption = ?, alt_text = ?, position = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
      `).bind(cleanText(item.caption, 240), altText, position, Number(item.id), current.id);
    });
    if (statements.length) await env.DB.batch(statements);
    const portfolio = await env.DB.prepare(`
      SELECT id, caption, alt_text, position, updated_at FROM portfolio_items
      WHERE user_id = ? ORDER BY position, id
    `).bind(current.id).all();
    return json(200, { portfolio: portfolio.results.map((item) => portfolioItem(item)), message: 'Portfolio atualizado.' });
  }

  if (routeId === 'account.portfolio.image') {
    const [itemId] = params;
    const current = await authenticatedUser(request, env);
    if (!current) return json(401, { error: 'Faca login novamente.' });
    const item = await env.DB.prepare('SELECT object_key FROM portfolio_items WHERE id = ? AND user_id = ?')
      .bind(Number(itemId), current.id).first();
    if (!item) return json(404, { error: 'Imagem nao encontrada.' });
    return storedImageResponse(await env.PROFILE_IMAGES.get(item.object_key), request, 'private, max-age=300, must-revalidate');
  }

  if (routeId === 'account.portfolio.delete') {
    const [portfolioItemId] = params;
    const current = await authenticatedUser(request, env);
    if (!current) return json(401, { error: 'Faca login novamente.' });
    const itemId = Number(portfolioItemId);
    const item = await env.DB.prepare('SELECT object_key FROM portfolio_items WHERE id = ? AND user_id = ?')
      .bind(itemId, current.id).first();
    if (!item) return json(404, { error: 'Imagem nao encontrada.' });
    await env.PROFILE_IMAGES.delete(item.object_key);
    await env.DB.prepare('DELETE FROM portfolio_items WHERE id = ? AND user_id = ?').bind(itemId, current.id).run();
    return json(200, { message: 'Imagem removida permanentemente.' });
  }

  if (routeId === 'account.professional-profile.read') {
    const current = await authenticatedUser(request, env);
    if (!current) return json(401, { error: 'Faca login novamente.' });
    const profile = await env.DB.prepare('SELECT * FROM professional_profiles WHERE user_id = ?').bind(current.id).first();
    return json(200, {
      profile: profile ? professionalProfile(profile, true) : {
        slug: `${slugify(current.name)}-${current.id}`,
        bio: '', specialties: [], city: '', state: '', serviceRadiusKm: null,
        startingPriceCents: null, availability: 'available', publicEmail: '', publicPhone: '',
        instagram: '', website: '', showEmail: false, showPhone: false, isPublished: false
      }
    });
  }

  if (routeId === 'account.professional-profile.update') {
    if (await isRateLimited(request, env, pathname, 30, 60 * 60 * 1000, env.ACCOUNT_RATE_LIMITER)) {
      return json(429, { error: 'Muitas alteracoes. Aguarde antes de tentar novamente.' });
    }
    const current = await authenticatedUser(request, env);
    if (!current) return json(401, { error: 'Faca login novamente.' });
    if (current.role !== 'photographer') {
      return json(403, { error: 'Selecione o perfil de fotografo nos dados pessoais para continuar.' });
    }
    const body = await readJson(request);
    const bio = cleanText(body.bio, 1200);
    const specialties = parseSpecialties(body.specialties);
    const city = cleanText(body.city, 80);
    const state = cleanText(body.state, 2).toUpperCase();
    const availability = ['available', 'limited', 'unavailable'].includes(body.availability) ? body.availability : 'available';
    const serviceRadiusKm = body.serviceRadiusKm === '' || body.serviceRadiusKm == null ? null : Number(body.serviceRadiusKm);
    const startingPriceCents = body.startingPriceCents === '' || body.startingPriceCents == null ? null : Number(body.startingPriceCents);
    const publicEmail = normalizeEmail(body.publicEmail);
    const publicPhone = cleanText(body.publicPhone, 30);
    const instagram = cleanText(body.instagram, 30).replace(/^@/, '');
    const submittedWebsite = cleanText(body.website, 300);
    const website = normalizeWebsite(submittedWebsite);
    const showEmail = body.showEmail === true && Boolean(publicEmail);
    const showPhone = body.showPhone === true && Boolean(publicPhone);
    const isPublished = body.isPublished === true;

    const invalidDraft =
      (state && !/^[A-Z]{2}$/.test(state)) ||
      (serviceRadiusKm !== null && (!Number.isInteger(serviceRadiusKm) || serviceRadiusKm < 0 || serviceRadiusKm > 1000)) ||
      (startingPriceCents !== null && (!Number.isInteger(startingPriceCents) || startingPriceCents < 0 || startingPriceCents > 100_000_000)) ||
      (publicEmail && !isValidEmail(publicEmail)) ||
      (publicPhone && publicPhone.length < 8) ||
      (instagram && !/^[A-Za-z0-9._]{1,30}$/.test(instagram)) ||
      (submittedWebsite && !website);
    if (invalidDraft) return json(400, { error: 'Revise os dados profissionais informados.' });

    const hasPublicContact = showEmail || showPhone || Boolean(instagram) || Boolean(website);
    const publishable = bio.length >= 60 && specialties.length > 0 && city.length >= 2 && /^[A-Z]{2}$/.test(state) && Boolean(current.profile_pic_key) && hasPublicContact;
    if (isPublished && !publishable) {
      return json(400, { error: 'Para publicar, adicione foto, apresentacao, especialidade, localizacao e ao menos um contato profissional.' });
    }

    const existing = await env.DB.prepare('SELECT slug FROM professional_profiles WHERE user_id = ?').bind(current.id).first();
    const slug = existing?.slug || `${slugify(current.name)}-${current.id}`;
    await env.DB.prepare(`
      INSERT INTO professional_profiles (
        user_id, slug, bio, specialties, city, state, service_radius_km, starting_price_cents,
        availability, public_email, public_phone, instagram, website, show_email, show_phone, is_published
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        bio = excluded.bio, specialties = excluded.specialties, city = excluded.city, state = excluded.state,
        service_radius_km = excluded.service_radius_km, starting_price_cents = excluded.starting_price_cents,
        availability = excluded.availability, public_email = excluded.public_email,
        public_phone = excluded.public_phone, instagram = excluded.instagram, website = excluded.website,
        show_email = excluded.show_email, show_phone = excluded.show_phone,
        is_published = excluded.is_published, updated_at = CURRENT_TIMESTAMP
    `).bind(
      current.id, slug, bio, JSON.stringify(specialties), city, state, serviceRadiusKm, startingPriceCents,
      availability, publicEmail, publicPhone, instagram, website, Number(showEmail), Number(showPhone), Number(isPublished)
    ).run();
    const profile = await env.DB.prepare('SELECT * FROM professional_profiles WHERE user_id = ?').bind(current.id).first();
    return json(200, { profile: professionalProfile(profile, true), message: isPublished ? 'Perfil profissional publicado.' : 'Perfil profissional salvo.' });
  }

  if (routeId === 'account.profile.update') {
    const current = await authenticatedUser(request, env);
    if (!current) return json(401, { error: 'Faca login novamente.' });
    const body = await readJson(request);
    const name = cleanText(body.name, 100);
    const email = normalizeEmail(body.email);
    const phone = cleanText(body.phone, 30);
    const role = ['client', 'photographer'].includes(body.role) ? body.role : 'client';
    const gender = ['male', 'female', 'other'].includes(body.gender) ? body.gender : 'other';
    const age = body.age === '' || body.age == null ? null : Number(body.age);
    if (name.length < 2 || !isValidEmail(email) || phone.length < 8 || (age !== null && (!Number.isInteger(age) || age < 0 || age > 120))) {
      return json(400, { error: 'Revise os dados informados.' });
    }
    const emailChanged = email !== normalizeEmail(current.email);
    if (emailChanged && !(await verifyPassword(String(body.currentPassword || ''), current.password_hash))) {
      return json(403, { error: 'Informe sua senha atual para alterar o e-mail.' });
    }
    const emailOwner = await env.DB.prepare('SELECT id FROM users WHERE email = ? AND id <> ?').bind(email, current.id).first();
    if (emailOwner) return json(409, { error: 'Este e-mail ja pertence a outra conta.' });

    const submittedPicture = String(body.profilePic || '');
    const keepsCurrentPicture = submittedPicture.startsWith(`/api/profile-picture/${current.id}`);
    let nextPictureKey = current.profile_pic_key || null;
    let newPictureKey = null;
    if (!submittedPicture) {
      nextPictureKey = null;
    } else if (!keepsCurrentPicture) {
      const picture = decodeProfilePicture(submittedPicture);
      newPictureKey = `profiles/${current.id}/${crypto.randomUUID()}.${picture.extension}`;
      await env.PROFILE_IMAGES.put(newPictureKey, picture.bytes, { httpMetadata: { contentType: picture.contentType } });
      nextPictureKey = newPictureKey;
    }

    try {
      const statements = [env.DB.prepare(`
        UPDATE users
        SET name = ?, email = ?, phone = ?, role = ?, age = ?, gender = ?, profile_pic_key = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(name, email, phone, role, age, gender, nextPictureKey, current.id)];
      if (emailChanged) {
        statements.push(
          env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?')
            .bind(current.id, current.authenticated_session_hash),
          env.DB.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').bind(current.id)
        );
      }
      if (role !== 'photographer' || !nextPictureKey) {
        statements.push(
          env.DB.prepare('UPDATE professional_profiles SET is_published = 0, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?')
            .bind(current.id)
        );
      }
      await env.DB.batch(statements);
    } catch (error) {
      if (newPictureKey) await env.PROFILE_IMAGES.delete(newPictureKey);
      if (String(error?.message).toUpperCase().includes('UNIQUE')) {
        return json(409, { error: 'Este e-mail ja pertence a outra conta.' });
      }
      throw error;
    }
    if (current.profile_pic_key && current.profile_pic_key !== nextPictureKey) {
      try {
        await env.PROFILE_IMAGES.delete(current.profile_pic_key);
      } catch {
        reportOperationalError(requestContext, 'storage.profile_picture.cleanup_failed', 'storage_error');
      }
    }
    const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(current.id).first();
    return json(200, { user: publicUser(user) });
  }

  if (routeId === 'account.password.update') {
    if (await isRateLimited(request, env, pathname, 8, 15 * 60 * 1000, env.AUTH_RATE_LIMITER)) {
      return json(429, { error: 'Muitas tentativas. Aguarde alguns minutos.' });
    }
    const current = await authenticatedUser(request, env);
    if (!current) return json(401, { error: 'Faca login novamente.' });
    const body = await readJson(request);
    const currentPassword = String(body.currentPassword || '');
    const newPassword = String(body.newPassword || '');
    if (!(await verifyPassword(currentPassword, current.password_hash))) {
      return json(403, { error: 'A senha atual esta incorreta.' });
    }
    if (!isValidPassword(newPassword)) {
      return json(400, { error: 'A nova senha deve ter ao menos 8 caracteres, uma letra e um numero.' });
    }
    if (await verifyPassword(newPassword, current.password_hash)) {
      return json(409, { error: 'A nova senha precisa ser diferente da senha atual.' });
    }
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .bind(await hashPassword(newPassword), current.id),
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?')
        .bind(current.id, current.authenticated_session_hash),
      env.DB.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').bind(current.id)
    ]);
    return json(200, { message: 'Senha alterada com sucesso. As outras sessoes foram encerradas.' });
  }

  if (routeId === 'account.photo.delete') {
    const current = await authenticatedUser(request, env);
    if (!current) return json(401, { error: 'Faca login novamente.' });
    if (current.profile_pic_key) await env.PROFILE_IMAGES.delete(current.profile_pic_key);
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET profile_pic_key = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(current.id),
      env.DB.prepare('UPDATE professional_profiles SET is_published = 0, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?').bind(current.id)
    ]);
    const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(current.id).first();
    return json(200, { user: publicUser(user), message: 'Foto removida com sucesso.' });
  }

  if (routeId === 'account.delete') {
    if (await isRateLimited(request, env, pathname, 5, 60 * 60 * 1000, env.SENSITIVE_RATE_LIMITER)) {
      return json(429, { error: 'Muitas tentativas. Aguarde antes de tentar novamente.' });
    }
    const current = await authenticatedUser(request, env);
    if (!current) return json(401, { error: 'Faca login novamente.' });
    const body = await readJson(request);
    const confirmation = cleanText(body.confirmation, 20).toUpperCase();
    if (!['EXCLUIR', 'DELETE'].includes(confirmation)) {
      return json(400, { error: 'Digite a frase de confirmacao exatamente como solicitado.' });
    }
    if (!(await verifyPassword(String(body.currentPassword || ''), current.password_hash))) {
      return json(403, { error: 'A senha atual esta incorreta.' });
    }

    // Remove private objects first. If R2 fails, relational ownership remains
    // intact so the user can retry instead of leaving personal files behind.
    const portfolioObjects = await env.DB.prepare('SELECT object_key FROM portfolio_items WHERE user_id = ?').bind(current.id).all();
    const ownedObjectKeys = [current.profile_pic_key, ...portfolioObjects.results.map((item) => item.object_key)].filter(Boolean);
    if (ownedObjectKeys.length) await env.PROFILE_IMAGES.delete(ownedObjectKeys);

    await env.DB.batch([
      env.DB.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').bind(current.id),
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(current.id),
      env.DB.prepare('DELETE FROM users WHERE id = ?').bind(current.id)
    ]);

    return json(200, { message: 'Conta e dados controlados por ela excluidos permanentemente.' }, {
      'Set-Cookie': sessionCookie('', request, 0)
    });
  }

  if (routeId === 'account.profile-picture') {
    const [userId] = params;
    const current = await authenticatedUser(request, env);
    if (!current || Number(userId) !== Number(current.id) || !current.profile_pic_key) {
      return json(404, { error: 'Imagem nao encontrada.' });
    }
    const object = await env.PROFILE_IMAGES.get(current.profile_pic_key);
    return storedImageResponse(object, request, 'private, max-age=300, must-revalidate');
  }

  if (routeId === 'contact.create') {
    if (await isRateLimited(request, env, pathname, 20, 60 * 60 * 1000, env.CONTENT_RATE_LIMITER)) {
      return json(429, { error: 'Limite de mensagens atingido. Tente mais tarde.' });
    }
    const body = await readJson(request);
    const name = cleanText(body.name, 100);
    const email = normalizeEmail(body.email);
    const phone = cleanText(body.phone, 30);
    const serviceType = cleanText(body.serviceType, 50);
    const eventDate = cleanText(body.eventDate, 20);
    const message = cleanText(body.message, 3000);
    if (name.length < 2 || !isValidEmail(email) || message.length < 10) {
      return json(400, { error: 'Informe nome, e-mail e uma mensagem com pelo menos 10 caracteres.' });
    }
    await env.DB.prepare(`
      INSERT INTO contact_messages (name, phone, email, service_type, event_date, message)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(name, phone || null, email, serviceType || null, eventDate || null, message).run();
    return json(201, { message: 'Mensagem recebida com sucesso.' });
  }

  if (routeId === 'newsletter.create') {
    if (await isRateLimited(request, env, pathname, 20, 60 * 60 * 1000, env.CONTENT_RATE_LIMITER)) {
      return json(429, { error: 'Limite de inscricoes atingido. Tente mais tarde.' });
    }
    const body = await readJson(request);
    const email = normalizeEmail(body.email);
    if (!isValidEmail(email)) return json(400, { error: 'Informe um e-mail valido.' });
    await env.DB.prepare(`
      INSERT INTO newsletter_subscriptions (email) VALUES (?)
      ON CONFLICT(email) DO NOTHING
    `).bind(email).run();
    return json(201, { message: 'Inscricao registrada com sucesso.' });
  }

  return json(404, { error: 'Endpoint nao encontrado.' });
}

async function handleAssetRequest(request, env) {
  const url = new URL(request.url);
  if (['GET', 'HEAD'].includes(request.method) && url.pathname === '/robots.txt') {
    const body = [
      'User-agent: *',
      'Allow: /',
      'Disallow: /api/',
      'Disallow: /perfil',
      'Disallow: /perfil.html',
      'Disallow: /login.html',
      'Disallow: /cadastro.html',
      'Disallow: /recuperar-senha.html',
      'Disallow: /redefinir-senha.html',
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
      { loc: new URL('/busca.html', url).toString() },
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
  const legacySlug = url.pathname === '/fotografo.html' ? url.searchParams.get('perfil') : '';
  if (['GET', 'HEAD'].includes(request.method) && /^[a-z0-9-]{3,80}$/.test(legacySlug || '')) {
    return Response.redirect(new URL(`/fotografo/${encodeURIComponent(legacySlug)}`, url), 301);
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
    return instrumentedResponse;
  }
};

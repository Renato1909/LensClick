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

async function isRateLimited(request, env, scope, limit, intervalMs) {
  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For')?.split(',')[0].trim() || 'local';
  return consumeRateLimit(env, `${scope}\0${ip}`, limit, intervalMs);
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

async function handleApi(request, env, url, context) {
  const { pathname } = url;
  const method = request.method.toUpperCase();
  if (!['GET', 'HEAD'].includes(method) && !requestOriginIsAllowed(request)) {
    return json(403, { error: 'Origem da requisicao nao autorizada.' });
  }

  if (pathname === '/api/auth/register' && method === 'POST') {
    if (await isRateLimited(request, env, pathname, 8, 15 * 60 * 1000)) {
      return json(429, { error: 'Muitas tentativas. Aguarde alguns minutos.' });
    }
    const body = await readJson(request);
    const name = cleanText(body.name, 100);
    const email = normalizeEmail(body.email);
    const phone = cleanText(body.phone, 30);
    const password = String(body.password || '');
    if (name.length < 2 || !isValidEmail(email) || phone.length < 8) {
      return json(400, { error: 'Preencha nome, e-mail e telefone corretamente.' });
    }
    if (!isValidPassword(password)) {
      return json(400, { error: 'A senha deve ter ao menos 8 caracteres, uma letra e um numero.' });
    }
    if (await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first()) {
      return json(409, { error: 'Este e-mail ja esta cadastrado.' });
    }
    try {
      const user = await env.DB.prepare(`
        INSERT INTO users (name, email, phone, password_hash)
        VALUES (?, ?, ?, ?)
        RETURNING *
      `).bind(name, email, phone, await hashPassword(password)).first();
      const cookie = await createSession(Number(user.id), request, env);
      return json(201, { user: publicUser(user) }, { 'Set-Cookie': cookie });
    } catch (error) {
      if (String(error?.message).toUpperCase().includes('UNIQUE')) return json(409, { error: 'Este e-mail ja esta cadastrado.' });
      throw error;
    }
  }

  if (pathname === '/api/auth/login' && method === 'POST') {
    if (await isRateLimited(request, env, pathname, 10, 15 * 60 * 1000)) {
      return json(429, { error: 'Muitas tentativas. Aguarde alguns minutos.' });
    }
    const body = await readJson(request);
    const email = normalizeEmail(body.email);
    const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
    if (!user || !(await verifyPassword(String(body.password || ''), user.password_hash))) {
      return json(401, { error: 'E-mail ou senha incorretos.' });
    }
    const cookie = await createSession(Number(user.id), request, env);
    return json(200, { user: publicUser(user) }, { 'Set-Cookie': cookie });
  }

  if (pathname === '/api/auth/password-reset/request' && method === 'POST') {
    if (!env.BREVO_API_KEY || !env.BREVO_SENDER_EMAIL) {
      return json(503, { error: 'A recuperacao de senha esta temporariamente indisponivel.' });
    }
    if (await isRateLimited(request, env, pathname, 5, 60 * 60 * 1000)) {
      return json(429, { error: 'Muitas solicitacoes. Aguarde antes de tentar novamente.' });
    }
    const body = await readJson(request);
    const email = normalizeEmail(body.email);
    const language = body.language === 'en' ? 'en' : 'pt';
    if (!isValidEmail(email)) return json(400, { error: 'Informe um e-mail valido.' });

    const genericResponse = {
      message: 'Se o e-mail estiver cadastrado, enviaremos as instrucoes para redefinir a senha.'
    };
    const emailLimited = await consumeRateLimit(env, `${pathname}:email\0${email}`, 3, 60 * 60 * 1000);
    const user = emailLimited ? null : await env.DB.prepare('SELECT id, name, email FROM users WHERE email = ?').bind(email).first();
    if (!user) return json(202, genericResponse);

    const token = randomToken();
    const now = Date.now();
    await env.DB.prepare('DELETE FROM password_reset_tokens WHERE expires_at <= ? OR user_id = ?').bind(now, user.id).run();
    await env.DB.prepare(`
      INSERT INTO password_reset_tokens (token_hash, user_id, expires_at)
      VALUES (?, ?, ?)
    `).bind(await sha256(token), user.id, now + PASSWORD_RESET_TTL_MS).run();

    const resetUrl = new URL('/redefinir-senha.html', request.url);
    resetUrl.searchParams.set('token', token);
    const delivery = sendPasswordResetEmail(env, user.email, user.name, resetUrl.toString(), language).catch(async (error) => {
      console.error('LensClick password reset delivery error:', error);
      await env.DB.prepare('DELETE FROM password_reset_tokens WHERE token_hash = ?').bind(await sha256(token)).run();
    });
    if (context?.waitUntil) context.waitUntil(delivery);
    else await delivery;
    return json(202, genericResponse);
  }

  if (pathname === '/api/auth/password-reset/confirm' && method === 'POST') {
    if (await isRateLimited(request, env, pathname, 10, 15 * 60 * 1000)) {
      return json(429, { error: 'Muitas tentativas. Aguarde alguns minutos.' });
    }
    const body = await readJson(request);
    const token = String(body.token || '');
    const password = String(body.password || '');
    if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) {
      return json(400, { error: 'Este link de recuperacao e invalido ou expirou.' });
    }
    if (!isValidPassword(password)) {
      return json(400, { error: 'A senha deve ter ao menos 8 caracteres, uma letra e um numero.' });
    }

    const consumed = await env.DB.prepare(`
      UPDATE password_reset_tokens
      SET used_at = CURRENT_TIMESTAMP
      WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?
      RETURNING user_id
    `).bind(await sha256(token), Date.now()).first();
    if (!consumed) return json(400, { error: 'Este link de recuperacao e invalido ou expirou.' });

    await env.DB.batch([
      env.DB.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .bind(await hashPassword(password), consumed.user_id),
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(consumed.user_id),
      env.DB.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').bind(consumed.user_id)
    ]);
    return json(200, { message: 'Senha alterada com sucesso. Faca login novamente.' });
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    const token = parseCookies(request)[SESSION_COOKIE];
    if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
    return json(200, { ok: true }, { 'Set-Cookie': sessionCookie('', request, 0) });
  }

  if (pathname === '/api/auth/me' && method === 'GET') {
    const user = await authenticatedUser(request, env);
    return user ? json(200, { user: publicUser(user) }) : json(401, { error: 'Sessao nao encontrada.' });
  }

  const publicPhotographerPhotoMatch = /^\/api\/photographers\/([a-z0-9-]{3,80})\/photo$/.exec(pathname);
  if (publicPhotographerPhotoMatch && method === 'GET') {
    const profile = await env.DB.prepare(`
      SELECT p.slug, u.profile_pic_key FROM professional_profiles p
      JOIN users u ON u.id = p.user_id
      WHERE p.slug = ? AND p.is_published = 1 AND u.role = 'photographer'
    `).bind(publicPhotographerPhotoMatch[1]).first();
    if (!profile?.profile_pic_key) return json(404, { error: 'Imagem nao encontrada.' });
    const object = await env.PROFILE_IMAGES.get(profile.profile_pic_key);
    return storedImageResponse(object, request, 'public, max-age=300, must-revalidate');
  }

  const publicPortfolioImageMatch = /^\/api\/photographers\/([a-z0-9-]{3,80})\/portfolio\/(\d+)$/.exec(pathname);
  if (publicPortfolioImageMatch && method === 'GET') {
    const item = await env.DB.prepare(`
      SELECT i.object_key FROM portfolio_items i
      JOIN professional_profiles p ON p.user_id = i.user_id
      JOIN users u ON u.id = i.user_id
      WHERE p.slug = ? AND i.id = ? AND p.is_published = 1 AND u.role = 'photographer'
    `).bind(publicPortfolioImageMatch[1], Number(publicPortfolioImageMatch[2])).first();
    if (!item) return json(404, { error: 'Imagem nao encontrada.' });
    return storedImageResponse(
      await env.PROFILE_IMAGES.get(item.object_key),
      request,
      'public, max-age=300, must-revalidate'
    );
  }

  const publicPhotographerMatch = /^\/api\/photographers\/([a-z0-9-]{3,80})$/.exec(pathname);
  if (publicPhotographerMatch && method === 'GET') {
    const profile = await env.DB.prepare(`
      SELECT p.*, u.name, u.profile_pic_key, u.updated_at AS user_updated_at
      FROM professional_profiles p
      JOIN users u ON u.id = p.user_id
      WHERE p.slug = ? AND p.is_published = 1 AND u.role = 'photographer'
    `).bind(publicPhotographerMatch[1]).first();
    if (!profile) return json(404, { error: 'Perfil profissional nao encontrado.' });
    const portfolio = await env.DB.prepare(`
      SELECT id, caption, alt_text, position, updated_at FROM portfolio_items
      WHERE user_id = ? ORDER BY position, id
    `).bind(profile.user_id).all();
    return json(200, {
      profile: { ...professionalProfile(profile), portfolio: portfolio.results.map((item) => portfolioItem(item, profile.slug)) }
    }, { 'Cache-Control': 'public, max-age=60' });
  }

  if (pathname === '/api/account/portfolio' && method === 'GET') {
    const current = await authenticatedUser(request, env);
    if (!current) return json(401, { error: 'Faca login novamente.' });
    const portfolio = await env.DB.prepare(`
      SELECT id, caption, alt_text, position, updated_at FROM portfolio_items
      WHERE user_id = ? ORDER BY position, id
    `).bind(current.id).all();
    return json(200, { portfolio: portfolio.results.map((item) => portfolioItem(item)) });
  }

  if (pathname === '/api/account/portfolio' && method === 'POST') {
    if (await isRateLimited(request, env, pathname, 20, 60 * 60 * 1000)) {
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

  if (pathname === '/api/account/portfolio' && method === 'PUT') {
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

  const ownerPortfolioImageMatch = /^\/api\/account\/portfolio\/(\d+)\/image$/.exec(pathname);
  if (ownerPortfolioImageMatch && method === 'GET') {
    const current = await authenticatedUser(request, env);
    if (!current) return json(401, { error: 'Faca login novamente.' });
    const item = await env.DB.prepare('SELECT object_key FROM portfolio_items WHERE id = ? AND user_id = ?')
      .bind(Number(ownerPortfolioImageMatch[1]), current.id).first();
    if (!item) return json(404, { error: 'Imagem nao encontrada.' });
    return storedImageResponse(await env.PROFILE_IMAGES.get(item.object_key), request, 'private, max-age=300, must-revalidate');
  }

  const ownerPortfolioMatch = /^\/api\/account\/portfolio\/(\d+)$/.exec(pathname);
  if (ownerPortfolioMatch && method === 'DELETE') {
    const current = await authenticatedUser(request, env);
    if (!current) return json(401, { error: 'Faca login novamente.' });
    const itemId = Number(ownerPortfolioMatch[1]);
    const item = await env.DB.prepare('SELECT object_key FROM portfolio_items WHERE id = ? AND user_id = ?')
      .bind(itemId, current.id).first();
    if (!item) return json(404, { error: 'Imagem nao encontrada.' });
    await env.PROFILE_IMAGES.delete(item.object_key);
    await env.DB.prepare('DELETE FROM portfolio_items WHERE id = ? AND user_id = ?').bind(itemId, current.id).run();
    return json(200, { message: 'Imagem removida permanentemente.' });
  }

  if (pathname === '/api/account/professional-profile' && method === 'GET') {
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

  if (pathname === '/api/account/professional-profile' && method === 'PUT') {
    if (await isRateLimited(request, env, pathname, 30, 60 * 60 * 1000)) {
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

  if (pathname === '/api/profile' && method === 'PUT') {
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
      } catch (error) {
        console.error('LensClick stale profile picture cleanup error:', error);
      }
    }
    const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(current.id).first();
    return json(200, { user: publicUser(user) });
  }

  if (pathname === '/api/account/password' && method === 'PUT') {
    if (await isRateLimited(request, env, pathname, 8, 15 * 60 * 1000)) {
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

  if (pathname === '/api/account/photo' && method === 'DELETE') {
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

  if (pathname === '/api/account' && method === 'DELETE') {
    if (await isRateLimited(request, env, pathname, 5, 60 * 60 * 1000)) {
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

  const pictureMatch = /^\/api\/profile-picture\/(\d+)$/.exec(pathname);
  if (pictureMatch && method === 'GET') {
    const current = await authenticatedUser(request, env);
    if (!current || Number(pictureMatch[1]) !== Number(current.id) || !current.profile_pic_key) {
      return json(404, { error: 'Imagem nao encontrada.' });
    }
    const object = await env.PROFILE_IMAGES.get(current.profile_pic_key);
    return storedImageResponse(object, request, 'private, max-age=300, must-revalidate');
  }

  if (pathname === '/api/contact' && method === 'POST') {
    if (await isRateLimited(request, env, pathname, 20, 60 * 60 * 1000)) {
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

  if (pathname === '/api/newsletter' && method === 'POST') {
    if (await isRateLimited(request, env, pathname, 20, 60 * 60 * 1000)) {
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

async function handleRequest(request, env, context) {
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/')) return handleApi(request, env, url, context);
  const assetResponse = await env.ASSETS.fetch(request);
  const headers = new Headers(assetResponse.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  if (headers.get('Content-Type')?.startsWith('text/html')) headers.set('Cache-Control', 'no-cache');
  return new Response(assetResponse.body, { status: assetResponse.status, statusText: assetResponse.statusText, headers });
}

export default {
  async fetch(request, env, context) {
    try {
      return await handleRequest(request, env, context);
    } catch (error) {
      console.error('LensClick Worker error:', error);
      const status = Number(error?.status) || 500;
      return json(status, { error: status < 500 ? error.message : 'Nao foi possivel concluir a operacao.' });
    }
  }
};

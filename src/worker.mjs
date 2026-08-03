const SESSION_COOKIE = 'lensclick_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;
const MAX_BODY_BYTES = 700_000;
const MAX_PROFILE_PICTURE_BYTES = 450_000;
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

async function authenticatedUser(request, env) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return null;
  return env.DB.prepare(`
    SELECT u.* FROM sessions s
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
      const user = await env.DB.prepare(`
        UPDATE users
        SET name = ?, email = ?, phone = ?, role = ?, age = ?, gender = ?, profile_pic_key = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        RETURNING *
      `).bind(name, email, phone, role, age, gender, nextPictureKey, current.id).first();
      if (current.profile_pic_key && current.profile_pic_key !== nextPictureKey) {
        await env.PROFILE_IMAGES.delete(current.profile_pic_key);
      }
      return json(200, { user: publicUser(user) });
    } catch (error) {
      if (newPictureKey) await env.PROFILE_IMAGES.delete(newPictureKey);
      throw error;
    }
  }

  const pictureMatch = /^\/api\/profile-picture\/(\d+)$/.exec(pathname);
  if (pictureMatch && method === 'GET') {
    const current = await authenticatedUser(request, env);
    if (!current || Number(pictureMatch[1]) !== Number(current.id) || !current.profile_pic_key) {
      return json(404, { error: 'Imagem nao encontrada.' });
    }
    const object = await env.PROFILE_IMAGES.get(current.profile_pic_key);
    if (!object) return json(404, { error: 'Imagem nao encontrada.' });
    const headers = new Headers(responseHeaders({ 'Cache-Control': 'private, max-age=300, must-revalidate' }));
    if (typeof object.writeHttpMetadata === 'function') object.writeHttpMetadata(headers);
    if (!headers.has('Content-Type')) headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
    if (object.httpEtag) headers.set('ETag', object.httpEtag);
    if (object.httpEtag && request.headers.get('If-None-Match') === object.httpEtag) {
      return new Response(null, { status: 304, headers });
    }
    return new Response(object.body, { headers });
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

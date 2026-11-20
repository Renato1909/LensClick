// ADR 002 — TOTP (RFC 6238) com Web Crypto, sem dependências externas.
// Helpers puros + operações de desafio/código no D1. Nenhuma função aqui loga
// segredo, código ou token.

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TOTP_STEP_MS = 30 * 1000;
const TOTP_WINDOW = 1; // ±1 passo
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function base32Encode(bytes) {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(input) {
  const normalized = String(input || '').toUpperCase().replace(/=+$/, '');
  let bits = 0;
  let value = 0;
  const output = [];
  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) throw new Error('Segredo TOTP invalido.');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(output);
}

export function generateTotpSecret() {
  return base32Encode(crypto.getRandomValues(new Uint8Array(20)));
}

export function otpauthUrl(secret, label, issuer = 'LensClick') {
  const url = new URL('otpauth://totp/');
  url.pathname = `${encodeURIComponent(issuer)}:${encodeURIComponent(label)}`;
  url.searchParams.set('secret', secret);
  url.searchParams.set('issuer', issuer);
  url.searchParams.set('algorithm', 'SHA1');
  url.searchParams.set('digits', '6');
  url.searchParams.set('period', '30');
  return url.toString();
}

export async function totpCode(secret, nowMs) {
  const counter = Math.floor(nowMs / TOTP_STEP_MS);
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setUint32(0, Math.floor(counter / 0x100000000), false);
  view.setUint32(4, counter >>> 0, false);
  const key = await crypto.subtle.importKey('raw', base32Decode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, buffer));
  const offset = signature[signature.length - 1] & 0x0f;
  const binary = ((signature[offset] & 0x7f) << 24)
    | ((signature[offset + 1] & 0xff) << 16)
    | ((signature[offset + 2] & 0xff) << 8)
    | (signature[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
}

export async function verifyTotp(secret, code, nowMs = Date.now()) {
  const submitted = String(code ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(submitted)) return false;
  for (let delta = -TOTP_WINDOW; delta <= TOTP_WINDOW; delta += 1) {
    if (await totpCode(secret, nowMs + delta * TOTP_STEP_MS) === submitted) return true;
  }
  return false;
}

export function generateRecoveryCodes(count = 10) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(count * 8));
  const codes = [];
  for (let i = 0; i < count; i += 1) {
    const slice = bytes.subarray(i * 8, i * 8 + 8);
    codes.push(`${[...slice].map((value) => alphabet[value % alphabet.length]).join('').slice(0, 4)}-${[...slice].map((value) => alphabet[(value * 7 + 3) % alphabet.length]).join('').slice(0, 4)}`);
  }
  return codes;
}

export async function isTwoFactorEnabled(env, userId) {
  const row = await env.DB.prepare('SELECT two_factor_enabled_at FROM users WHERE id = ?').bind(userId).first();
  return Boolean(row?.two_factor_enabled_at);
}

export async function createChallenge(env, userId, kind, sha256, randomToken, ttlMs = CHALLENGE_TTL_MS) {
  const token = randomToken();
  const now = Date.now();
  await env.DB.prepare(`
    INSERT INTO two_factor_challenges (token_hash, user_id, kind, attempts, expires_at)
    VALUES (?, ?, ?, 0, ?)
  `).bind(await sha256(token), userId, kind, now + ttlMs).run();
  return { token, expiresAt: now + ttlMs };
}

export async function loadChallenge(env, token, kind, sha256) {
  if (!/^[A-Za-z0-9_-]{40,200}$/.test(String(token || ''))) return null;
  const row = await env.DB.prepare('SELECT * FROM two_factor_challenges WHERE token_hash = ? AND kind = ?')
    .bind(await sha256(token), kind).first();
  if (!row || Number(row.expires_at) <= Date.now() || Number(row.attempts) >= MAX_ATTEMPTS) return null;
  return row;
}

export async function failChallenge(env, tokenHash) {
  const row = await env.DB.prepare('SELECT attempts FROM two_factor_challenges WHERE token_hash = ?').bind(tokenHash).first();
  const attempts = Number(row?.attempts || 0) + 1;
  if (attempts >= MAX_ATTEMPTS) {
    await env.DB.prepare('DELETE FROM two_factor_challenges WHERE token_hash = ?').bind(tokenHash).run();
    return { ok: false, exhausted: true };
  }
  await env.DB.prepare('UPDATE two_factor_challenges SET attempts = ? WHERE token_hash = ?').bind(attempts, tokenHash).run();
  return { ok: true, exhausted: false, attempts };
}

export async function deleteChallenge(env, tokenHash) {
  await env.DB.prepare('DELETE FROM two_factor_challenges WHERE token_hash = ?').bind(tokenHash).run();
}

export async function audit(env, userId, event) {
  try {
    await env.DB.prepare('INSERT INTO two_factor_audit (user_id, event, at) VALUES (?, ?, ?)').bind(userId, event, Date.now()).run();
  } catch {
    // Auditoria nunca derruba o fluxo de autenticação.
  }
}

export function createTwoFactorHandlers({ json, authenticatedUser, readJson, cleanText, isRateLimited, sha256, randomToken, verifyPassword, verifyTotp: checkTotp, generateSecret, generateCodes, audit: auditEvent, loadChallenge: load, failChallenge: fail, deleteChallenge: drop, createChallenge: issue }) {
  async function currentUser(request, env) {
    const current = await authenticatedUser(request, env);
    return current ? current : null;
  }

  async function status({ request, env }) {
    const current = await currentUser(request, env);
    if (!current) return json(401, { error: 'Faca login novamente.' });
    const devices = await env.DB.prepare("SELECT COUNT(*) AS total FROM two_factor_trusted_devices WHERE user_id = ? AND expires_at > ?").bind(current.id, Date.now()).first();
    const codes = await env.DB.prepare('SELECT COUNT(*) AS total FROM two_factor_recovery_codes WHERE user_id = ? AND used_at IS NULL').bind(current.id).first();
    return json(200, {
      enabled: Boolean(current.two_factor_enabled_at),
      trustedDevices: Number(devices?.total || 0),
      recoveryCodesRemaining: Number(codes?.total || 0)
    });
  }

  async function status({ request, env }) {
    const current = await currentUser(request, env);
    if (!current) return json(401, { error: 'Faca login novamente.' });
    const devices = await env.DB.prepare("SELECT COUNT(*) AS total FROM two_factor_trusted_devices WHERE user_id = ? AND expires_at > ?").bind(current.id, Date.now()).first();
    const codes = await env.DB.prepare('SELECT COUNT(*) AS total FROM two_factor_recovery_codes WHERE user_id = ? AND used_at IS NULL').bind(current.id).first();
    return json(200, {
      enabled: Boolean(current.two_factor_enabled_at),
      method: 'totp',
      trustedDevices: Number(devices?.total || 0),
      recoveryCodesRemaining: Number(codes?.total || 0)
    });
  }

  async function beginEnrollment({ request, env, pathname, appCompatible = false }) {
    if (await isRateLimited(request, env, pathname, 5, 60 * 60 * 1000, env.SENSITIVE_RATE_LIMITER)) {
      return json(429, { error: 'Muitas tentativas. Aguarde antes de tentar novamente.' });
    }
    const current = await currentUser(request, env);
    if (!current) return json(401, { error: 'Faca login novamente.' });
    if (current.two_factor_enabled_at) return json(409, { error: 'A autenticacao em duas etapas ja esta ativa.' });
    let body = {};
    try { body = await readJson(request); } catch { /* setup do app envia sem corpo */ }
    const providedPassword = String(body.currentPassword || body.password || '');
    if (providedPassword && !(await verifyPassword(providedPassword, current.password_hash))) {
      return json(403, { error: 'A senha atual esta incorreta.' });
    }
    const secret = generateSecret();
    const label = String(current.email || current.id);
    const codes = appCompatible ? generateCodes() : null;
    const statements = [
      env.DB.prepare('UPDATE users SET two_factor_secret = ? WHERE id = ?').bind(secret, current.id),
      env.DB.prepare('DELETE FROM two_factor_challenges WHERE user_id = ? AND kind = ?').bind(current.id, 'enrollment'),
      env.DB.prepare('DELETE FROM two_factor_recovery_codes WHERE user_id = ?').bind(current.id)
    ];
    if (codes) {
      for (const code of codes) {
        statements.push(env.DB.prepare('INSERT INTO two_factor_recovery_codes (user_id, code_hash) VALUES (?, ?)').bind(current.id, await sha256(code)));
      }
    }
    await env.DB.batch(statements);
    const challenge = await issue(env, current.id, 'enrollment', sha256, randomToken);
    await auditEvent(env, current.id, 'enrollment_started');
    // Secret, URL e códigos são entregues UMA ÚNICA VEZ, nunca em respostas posteriores.
    return json(200, {
      secret,
      otpauthUrl: otpauthUrl(secret, label),
      challengeToken: challenge.token,
      expiresAt: challenge.expiresAt,
      ...(codes ? { recoveryCodes: codes } : {})
    });
  }

  async function confirm({ request, env, pathname }) {
    if (await isRateLimited(request, env, pathname, 5, 60 * 60 * 1000, env.SENSITIVE_RATE_LIMITER)) {
      return json(429, { error: 'Muitas tentativas. Aguarde antes de tentar novamente.' });
    }
    const current = await currentUser(request, env);
    if (!current) return json(401, { error: 'Faca login novamente.' });
    if (current.two_factor_enabled_at) return json(409, { error: 'A autenticacao em duas etapas ja esta ativa.' });
    let body = {};
    try { body = await readJson(request); } catch { /* payload obrigatório abaixo */ }
    const explicitChallenge = Boolean(body.challengeToken);
    const rawToken = body.challengeToken || request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    const challenge = rawToken ? await load(env, rawToken, 'enrollment', sha256) : null;
    // O app envia apenas {code} com o Bearer da sessão; o challenge é opcional nesse caso.
    if (explicitChallenge && !challenge) {
      return json(400, { error: 'Desafio de ativacao invalido ou expirado.' });
    }
    if (challenge && Number(challenge.user_id) !== Number(current.id)) {
      return json(400, { error: 'Desafio de ativacao invalido ou expirado.' });
    }
    const row = await env.DB.prepare('SELECT two_factor_secret FROM users WHERE id = ?').bind(current.id).first();
    if (!row?.two_factor_secret || !(await checkTotp(row.two_factor_secret, String(body.code || '')))) {
      if (challenge) await fail(env, await sha256(String(rawToken)));
      await auditEvent(env, current.id, 'verify_failed');
      return json(400, { error: 'Codigo invalido.' });
    }
    const existing = await env.DB.prepare('SELECT code_hash FROM two_factor_recovery_codes WHERE user_id = ?').bind(current.id).all();
    const codes = existing.results?.length ? null : generateCodes();
    const now = Date.now();
    const statements = [
      env.DB.prepare('UPDATE users SET two_factor_enabled_at = ? WHERE id = ?').bind(now, current.id)
    ];
    if (codes) {
      for (const code of codes) {
        statements.push(env.DB.prepare('INSERT INTO two_factor_recovery_codes (user_id, code_hash) VALUES (?, ?)').bind(current.id, await sha256(code)));
      }
    }
    if (challenge) statements.push(env.DB.prepare('DELETE FROM two_factor_challenges WHERE token_hash = ?').bind(await sha256(String(rawToken))));
    await env.DB.batch(statements);
    await auditEvent(env, current.id, 'enabled');
    // Primeira e única resposta com códigos em claro quando o cliente não os recebeu no setup.
    return json(200, { success: true, enabled: true, ...(codes ? { recoveryCodes: codes } : {}) });
  }

  async function disable({ request, env, pathname }) {
    if (await isRateLimited(request, env, pathname, 5, 60 * 60 * 1000, env.SENSITIVE_RATE_LIMITER)) {
      return json(429, { error: 'Muitas tentativas. Aguarde antes de tentar novamente.' });
    }
    const current = await currentUser(request, env);
    if (!current) return json(401, { error: 'Faca login novamente.' });
    if (!current.two_factor_enabled_at) return json(409, { error: 'A autenticacao em duas etapas nao esta ativa.' });
    let body = {};
    try { body = await readJson(request); } catch { /* senha obrigatória abaixo */ }
    const providedPassword = String(body.currentPassword || body.password || '');
    if (!(await verifyPassword(providedPassword, current.password_hash))) {
      return json(403, { error: 'A senha atual esta incorreta.' });
    }
    const row = await env.DB.prepare('SELECT two_factor_secret FROM users WHERE id = ?').bind(current.id).first();
    const code = cleanText(String(body.code || ''), 32);
    const validTotp = row?.two_factor_secret && await checkTotp(row.two_factor_secret, code);
    let validRecovery = false;
    if (!validTotp && code) {
      const hashed = await sha256(code.toUpperCase());
      const match = await env.DB.prepare('SELECT id FROM two_factor_recovery_codes WHERE user_id = ? AND code_hash = ? AND used_at IS NULL').bind(current.id, hashed).first();
      if (match) {
        validRecovery = true;
        await env.DB.prepare('UPDATE two_factor_recovery_codes SET used_at = ? WHERE id = ?').bind(Date.now(), match.id).run();
        await auditEvent(env, current.id, 'recovery_code_used');
      }
    }
    if (!validTotp && !validRecovery) return json(400, { error: 'Codigo invalido.' });
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET two_factor_secret = NULL, two_factor_enabled_at = NULL WHERE id = ?').bind(current.id),
      env.DB.prepare('DELETE FROM two_factor_recovery_codes WHERE user_id = ?').bind(current.id),
      env.DB.prepare('DELETE FROM two_factor_trusted_devices WHERE user_id = ?').bind(current.id),
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(current.id)
    ]);
    await auditEvent(env, current.id, 'disabled');
    return json(200, { success: true, ok: true, message: 'Autenticacao em duas etapas desativada. Todas as sessoes foram encerradas.' });
  }

  async function revokeTrustedDevice({ params, request, env }) {
    const current = await currentUser(request, env);
    if (!current) return json(401, { error: 'Faca login novamente.' });
    const result = await env.DB.prepare('DELETE FROM two_factor_trusted_devices WHERE id = ? AND user_id = ?').bind(Number(params[0]), current.id).run();
    if (!Number(result?.meta?.changes || 0)) return json(404, { error: 'Dispositivo nao encontrado.' });
    await auditEvent(env, current.id, 'trusted_device_revoked');
    return json(200, { ok: true });
  }

  return {
    status,
    enrollment: (args) => beginEnrollment(args),
    setup: (args) => beginEnrollment({ ...args, appCompatible: true }),
    confirm,
    enable: confirm,
    disable,
    revokeTrustedDevice
  };
}

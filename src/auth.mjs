// Authentication handlers are isolated from the request router by dependency injection.
export function createAuthHandlers(deps) {
  const {
    json, cleanText, normalizeEmail, isValidEmail, isValidPassword,
    isRateLimited, readJson, hashPassword, verifyPassword, createSession,
    publicUser, consumeRateLimit, randomToken, sha256, sendPasswordResetEmail,
    authenticatedUser, parseCookies, sessionCookie, reportOperationalError,
    sessionCookieName, passwordResetTtlMs
  } = deps;

  return {
    async register({ request, env, pathname }) {
      if (await isRateLimited(request, env, pathname, 8, 15 * 60 * 1000, env.AUTH_RATE_LIMITER)) {
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
    },

    async login({ request, env, pathname }) {
      if (await isRateLimited(request, env, pathname, 10, 15 * 60 * 1000, env.AUTH_RATE_LIMITER)) {
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
    },

    async passwordResetRequest({ request, env, pathname, context, requestContext }) {
      if (!env.BREVO_API_KEY || !env.BREVO_SENDER_EMAIL) {
        return json(503, { error: 'A recuperacao de senha esta temporariamente indisponivel.' });
      }
      if (await isRateLimited(request, env, pathname, 5, 60 * 60 * 1000, env.SENSITIVE_RATE_LIMITER)) {
        return json(429, { error: 'Muitas solicitacoes. Aguarde antes de tentar novamente.' });
      }
      const body = await readJson(request);
      const email = normalizeEmail(body.email);
      const language = body.language === 'en' ? 'en' : 'pt';
      if (!isValidEmail(email)) return json(400, { error: 'Informe um e-mail valido.' });
      const genericResponse = { message: 'Se o e-mail estiver cadastrado, enviaremos as instrucoes para redefinir a senha.' };
      const emailLimited = await consumeRateLimit(env, `${pathname}:email\0${email}`, 3, 60 * 60 * 1000);
      const user = emailLimited ? null : await env.DB.prepare('SELECT id, name, email FROM users WHERE email = ?').bind(email).first();
      if (!user) return json(202, genericResponse);
      const token = randomToken();
      const now = Date.now();
      await env.DB.prepare('DELETE FROM password_reset_tokens WHERE expires_at <= ? OR user_id = ?').bind(now, user.id).run();
      await env.DB.prepare('INSERT INTO password_reset_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
        .bind(await sha256(token), user.id, now + passwordResetTtlMs).run();
      const resetUrl = new URL('/redefinir-senha.html', request.url);
      resetUrl.searchParams.set('token', token);
      const delivery = sendPasswordResetEmail(env, user.email, user.name, resetUrl.toString(), language).catch(async () => {
        reportOperationalError(requestContext, 'email.password_reset.delivery_failed', 'email_delivery_error');
        await env.DB.prepare('DELETE FROM password_reset_tokens WHERE token_hash = ?').bind(await sha256(token)).run();
      });
      if (context?.waitUntil) context.waitUntil(delivery);
      else await delivery;
      return json(202, genericResponse);
    },

    async passwordResetConfirm({ request, env, pathname }) {
      if (await isRateLimited(request, env, pathname, 10, 15 * 60 * 1000, env.AUTH_RATE_LIMITER)) {
        return json(429, { error: 'Muitas tentativas. Aguarde alguns minutos.' });
      }
      const body = await readJson(request);
      const token = String(body.token || '');
      const password = String(body.password || '');
      if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) return json(400, { error: 'Este link de recuperacao e invalido ou expirou.' });
      if (!isValidPassword(password)) return json(400, { error: 'A senha deve ter ao menos 8 caracteres, uma letra e um numero.' });
      const consumed = await env.DB.prepare(`
        UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP
        WHERE token_hash = ? AND used_at IS NULL AND expires_at > ? RETURNING user_id
      `).bind(await sha256(token), Date.now()).first();
      if (!consumed) return json(400, { error: 'Este link de recuperacao e invalido ou expirou.' });
      await env.DB.batch([
        env.DB.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(await hashPassword(password), consumed.user_id),
        env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(consumed.user_id),
        env.DB.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').bind(consumed.user_id)
      ]);
      return json(200, { message: 'Senha alterada com sucesso. Faca login novamente.' });
    },

    async logout({ request, env }) {
      const token = parseCookies(request)[sessionCookieName];
      if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
      return json(200, { ok: true }, { 'Set-Cookie': sessionCookie('', request, 0) });
    },

    async me({ request, env }) {
      const user = await authenticatedUser(request, env);
      return user ? json(200, { user: publicUser(user) }) : json(401, { error: 'Sessao nao encontrada.' });
    }
  };
}

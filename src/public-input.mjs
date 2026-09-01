export function createPublicInputHandlers({ json, isRateLimited, readJson, cleanText, normalizeEmail, isValidEmail }) {
  async function contact({ request, env, pathname }) {
    if (await isRateLimited(request, env, pathname, 20, 60 * 60 * 1000, env.CONTENT_RATE_LIMITER)) return json(429, { error: 'Limite de mensagens atingido. Tente mais tarde.' });
    const body = await readJson(request), name = cleanText(body.name, 100), email = normalizeEmail(body.email), phone = cleanText(body.phone, 30), serviceType = cleanText(body.serviceType, 50), eventDate = cleanText(body.eventDate, 20), message = cleanText(body.message, 3000);
    if (name.length < 2 || !isValidEmail(email) || message.length < 10) return json(400, { error: 'Informe nome, e-mail e uma mensagem com pelo menos 10 caracteres.' });
    await env.DB.prepare('INSERT INTO contact_messages (name, phone, email, service_type, event_date, message) VALUES (?, ?, ?, ?, ?, ?)').bind(name, phone || null, email, serviceType || null, eventDate || null, message).run();
    return json(201, { message: 'Mensagem recebida com sucesso.' });
  }
  async function newsletter({ request, env, pathname }) {
    if (await isRateLimited(request, env, pathname, 20, 60 * 60 * 1000, env.CONTENT_RATE_LIMITER)) return json(429, { error: 'Limite de inscricoes atingido. Tente mais tarde.' });
    const email = normalizeEmail((await readJson(request)).email); if (!isValidEmail(email)) return json(400, { error: 'Informe um e-mail valido.' });
    await env.DB.prepare('INSERT INTO newsletter_subscriptions (email) VALUES (?) ON CONFLICT(email) DO NOTHING').bind(email).run();
    return json(201, { message: 'Inscricao registrada com sucesso.' });
  }
  return { contact, newsletter };
}

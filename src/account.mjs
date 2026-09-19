export function createAccountHandlers({ json, authenticatedUser, isRateLimited, readJson, conversationSummary, accountMessage, portfolioItem }) {
  async function listConversations({ request, env, url }) {
    const current = await authenticatedUser(request, env);
    if (!current) return json(401, { error: 'Faca login novamente.' });
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1), pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get('pageSize')) || 20)), offset = (page - 1) * pageSize;
    const total = Number((await env.DB.prepare('SELECT COUNT(*) AS total FROM conversations WHERE client_user_id = ? OR photographer_user_id = ?').bind(current.id, current.id).first())?.total || 0);
    const result = await env.DB.prepare(`SELECT c.*, client.name AS client_name, photographer.name AS photographer_name, p.slug AS photographer_slug, (SELECT body FROM messages WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1) AS last_message, (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND sender_user_id <> ? AND read_at IS NULL) AS unread_count FROM conversations c JOIN users client ON client.id = c.client_user_id JOIN users photographer ON photographer.id = c.photographer_user_id LEFT JOIN professional_profiles p ON p.user_id = c.photographer_user_id WHERE c.client_user_id = ? OR c.photographer_user_id = ? ORDER BY c.last_message_at DESC, c.id DESC LIMIT ? OFFSET ?`).bind(current.id, current.id, current.id, pageSize, offset).all();
    return json(200, { conversations: result.results.map((row) => conversationSummary(row, current.id)), pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
  }
  async function messages({ params, request, env, url }) {
    const current = await authenticatedUser(request, env); if (!current) return json(401, { error: 'Faca login novamente.' });
    const conversationId = Number(params[0]); const conversation = await env.DB.prepare('SELECT id FROM conversations WHERE id = ? AND (client_user_id = ? OR photographer_user_id = ?)').bind(conversationId, current.id, current.id).first();
    if (!conversation) return json(404, { error: 'Conversa nao encontrada.' });
    const before = Math.max(0, Number(url.searchParams.get('before')) || 0), pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize')) || 50));
    const result = await env.DB.prepare('SELECT id, conversation_id, sender_user_id, body, read_at, created_at FROM messages WHERE conversation_id = ? AND (? = 0 OR id < ?) ORDER BY id DESC LIMIT ?').bind(conversationId, before, before, pageSize + 1).all();
    const hasMore = result.results.length > pageSize, visible = result.results.slice(0, pageSize); return json(200, { messages: visible.reverse().map(accountMessage), pagination: { hasMore, nextBefore: hasMore ? Number(visible[0].id) : null } });
  }
  async function createMessage({ params, request, env, pathname }) {
    if (await isRateLimited(request, env, pathname, 30, 60 * 60 * 1000, env.CONTENT_RATE_LIMITER)) return json(429, { error: 'Limite de mensagens atingido. Tente mais tarde.' });
    const current = await authenticatedUser(request, env); if (!current) return json(401, { error: 'Faca login novamente.' }); const conversationId = Number(params[0]);
    const conversation = await env.DB.prepare('SELECT id, status FROM conversations WHERE id = ? AND (client_user_id = ? OR photographer_user_id = ?)').bind(conversationId, current.id, current.id).first();
    if (!conversation) return json(404, { error: 'Conversa nao encontrada.' }); if (conversation.status !== 'active') return json(409, { error: 'Esta conversa esta encerrada.' });
    const body = String((await readJson(request)).message ?? '').trim(); if (!body) return json(400, { error: 'Escreva uma mensagem antes de enviar.' }); if (body.length > 2000) return json(400, { error: 'A mensagem deve ter no maximo 2000 caracteres.' });
    const results = await env.DB.batch([env.DB.prepare('INSERT INTO messages (conversation_id, sender_user_id, body) VALUES (?, ?, ?)').bind(conversationId, current.id, body), env.DB.prepare('UPDATE conversations SET last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(conversationId)]);
    const message = await env.DB.prepare('SELECT id, conversation_id, sender_user_id, body, read_at, created_at FROM messages WHERE id = ?').bind(Number(results[0]?.meta?.last_row_id || 0)).first(); return json(201, { message: accountMessage(message) });
  }
  async function markRead({ params, request, env }) { const current = await authenticatedUser(request, env); if (!current) return json(401, { error: 'Faca login novamente.' }); const id = Number(params[0]); const conversation = await env.DB.prepare('SELECT id FROM conversations WHERE id = ? AND (client_user_id = ? OR photographer_user_id = ?)').bind(id, current.id, current.id).first(); if (!conversation) return json(404, { error: 'Conversa nao encontrada.' }); const result = await env.DB.prepare('UPDATE messages SET read_at = CURRENT_TIMESTAMP WHERE conversation_id = ? AND sender_user_id <> ? AND read_at IS NULL').bind(id, current.id).run(); return json(200, { ok: true, updated: Number(result.meta?.changes || 0) }); }
  async function portfolioList({ request, env }) { const current = await authenticatedUser(request, env); if (!current) return json(401, { error: 'Faca login novamente.' }); const portfolio = await env.DB.prepare('SELECT id, caption, alt_text, position, is_cover, category, updated_at FROM portfolio_items WHERE user_id = ? ORDER BY position, id').bind(current.id).all(); return json(200, { portfolio: portfolio.results.map((item) => portfolioItem(item)) }); }
  async function exportData({ request, env, pathname }) {
    if (await isRateLimited(request, env, pathname, 5, 60 * 60 * 1000, env.SENSITIVE_RATE_LIMITER)) return json(429, { error: 'Muitas solicitacoes. Aguarde antes de tentar novamente.' });
    const current = await authenticatedUser(request, env); if (!current) return json(401, { error: 'Faca login novamente.' });
    const id = Number(current.id);
    const [profile, professionalProfile, portfolio, reviewRequests, reviewsAuthored, reviewsReceived, conversations, messages, contactMessages, newsletter] = await Promise.all([
      env.DB.prepare('SELECT id, name, email, phone, role, age, gender, profile_pic_key, email_verified_at, is_admin, created_at, updated_at FROM users WHERE id = ?').bind(id).first(),
      env.DB.prepare('SELECT slug, bio, specialties, city, state, service_radius_km, starting_price_cents, availability, is_published, public_email, public_phone, show_email, show_phone, created_at, updated_at FROM professional_profiles WHERE user_id = ?').bind(id).first(),
      env.DB.prepare('SELECT id, caption, alt_text, position, created_at, updated_at FROM portfolio_items WHERE user_id = ? ORDER BY position, id').bind(id).all(),
      env.DB.prepare('SELECT id, client_user_id, photographer_user_id, message, status, confirmed_at, created_at, updated_at FROM review_requests WHERE client_user_id = ? OR photographer_user_id = ? ORDER BY id').bind(id, id).all(),
      env.DB.prepare('SELECT id, photographer_user_id, rating, comment, status, created_at, updated_at FROM reviews WHERE client_user_id = ? ORDER BY id').bind(id).all(),
      env.DB.prepare('SELECT id, client_user_id, rating, comment, status, created_at, updated_at FROM reviews WHERE photographer_user_id = ? ORDER BY id').bind(id).all(),
      env.DB.prepare('SELECT id, client_user_id, photographer_user_id, status, last_message_at, created_at, updated_at FROM conversations WHERE client_user_id = ? OR photographer_user_id = ? ORDER BY id').bind(id, id).all(),
      env.DB.prepare('SELECT m.id, m.conversation_id, m.sender_user_id, m.body, m.read_at, m.created_at FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.client_user_id = ? OR c.photographer_user_id = ? ORDER BY m.id').bind(id, id).all(),
      env.DB.prepare('SELECT id, name, email, message, created_at FROM contact_messages WHERE email = ? ORDER BY id').bind(String(current.email)).all(),
      env.DB.prepare('SELECT id, email, created_at FROM newsletter_subscriptions WHERE email = ? ORDER BY id').bind(String(current.email)).all()
    ]);
    const pick = (row, keys) => { const out = {}; for (const key of keys) out[key] = row?.[key] ?? null; return out; };
    return json(200, {
      exportedAt: new Date().toISOString(),
      scope: 'Dados vinculados a esta conta, incluindo conversas com nomes de contraparte para contexto. Sem credenciais e sem binarios de imagem.',
      user: pick(profile, ['id', 'name', 'email', 'phone', 'role', 'age', 'gender', 'email_verified_at', 'is_admin', 'created_at', 'updated_at']),
      professionalProfile: professionalProfile || null,
      portfolio: (portfolio.results || []).map((item) => portfolioItem(item)),
      reviewRequests: reviewRequests.results || [],
      reviewsAuthored: reviewsAuthored.results || [],
      reviewsReceived: reviewsReceived.results || [],
      conversations: conversations.results || [],
      messages: messages.results || [],
      contactMessages: contactMessages.results || [],
      newsletterSubscriptions: newsletter.results || []
    }, { 'Content-Disposition': 'attachment; filename="lensclick-dados.json"' });
  }
  return { listConversations, messages, createMessage, markRead, portfolioList, exportData };
}

export function createAccountHandlers({ json, authenticatedUser, isRateLimited, readJson, conversationSummary, accountMessage }) {
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
  return { listConversations, messages, createMessage, markRead };
}

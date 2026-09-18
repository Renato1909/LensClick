// Administrative handlers are isolated from the request router by dependency injection.
// Every route in this module requires an authenticated administrator (see requireAdmin).
export function createAdminHandlers(deps) {
  const { json, cleanText, readJson, isRateLimited, authenticatedUser } = deps;

  const REVIEW_STATUSES = new Set(['active', 'moderated', 'deleted']);
  const CONVERSATION_STATUSES = new Set(['active', 'closed']);

  async function requireAdmin(request, env, pathname) {
    const user = await authenticatedUser(request, env);
    if (!user) return { user: null, response: json(401, { error: 'Sessao nao encontrada.' }) };
    const fresh = await env.DB.prepare('SELECT is_admin FROM users WHERE id = ?').bind(Number(user.id)).first();
    if (!fresh || Number(fresh.is_admin) !== 1) {
      return { user: null, response: json(403, { error: 'Acesso restrito.' }) };
    }
    return { user, response: null };
  }

  function paging(url, max = 50) {
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 20), 1), max);
    return { limit };
  }

  return {
    requireAdmin,

    async overview({ request, env, pathname }) {
      if (await isRateLimited(request, env, pathname, 10, 15 * 60 * 1000, env.AUTH_RATE_LIMITER)) {
        return json(429, { error: 'Muitas tentativas. Aguarde alguns minutos.' });
      }
      const gate = await requireAdmin(request, env, pathname);
      if (!gate.user) return gate.response;
      async function count(sql) {
        const row = await env.DB.prepare(sql).first();
        return Number(row?.total || 0);
      }
      const [users, unverifiedUsers, publishedPhotographers, pendingReviewRequests, activeConversations] = await Promise.all([
        count('SELECT COUNT(*) AS total FROM users'),
        count('SELECT COUNT(*) AS total FROM users WHERE email_verified_at IS NULL'),
        count('SELECT COUNT(*) AS total FROM professional_profiles WHERE is_published = 1'),
        count("SELECT COUNT(*) AS total FROM review_requests WHERE status = 'pending'"),
        count("SELECT COUNT(*) AS total FROM conversations WHERE status = 'active'")
      ]);
      return json(200, {
        overview: { users, unverifiedUsers, publishedPhotographers, pendingReviewRequests, activeConversations }
      });
    },

    async reviewsList({ request, env, url, pathname }) {
      if (await isRateLimited(request, env, pathname, 10, 15 * 60 * 1000, env.AUTH_RATE_LIMITER)) {
        return json(429, { error: 'Muitas tentativas. Aguarde alguns minutos.' });
      }
      const gate = await requireAdmin(request, env, pathname);
      if (!gate.user) return gate.response;
      const status = String(url.searchParams.get('status') || 'active');
      if (status !== 'all' && !REVIEW_STATUSES.has(status)) {
        return json(400, { error: 'Filtro de status invalido.' });
      }
      const { limit } = paging(url);
      const rows = await env.DB.prepare(`
        SELECT r.id, r.rating, r.comment, r.status, r.created_at, r.updated_at,
          c.name AS client_name, p.name AS photographer_name
        FROM reviews r
        JOIN users c ON c.id = r.client_user_id
        JOIN users p ON p.id = r.photographer_user_id
        ${status === 'all' ? '' : 'WHERE r.status = ?'}
        ORDER BY r.updated_at DESC, r.id DESC LIMIT ?
      `).bind(...(status === 'all' ? [limit] : [status, limit])).all();
      return json(200, {
        reviews: (rows.results || []).map((row) => ({
          id: Number(row.id),
          rating: Number(row.rating),
          comment: row.comment || '',
          status: row.status,
          clientName: row.client_name,
          photographerName: row.photographer_name,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        }))
      });
    },

    async reviewUpdate({ params, request, env, pathname }) {
      if (await isRateLimited(request, env, pathname, 10, 15 * 60 * 1000, env.AUTH_RATE_LIMITER)) {
        return json(429, { error: 'Muitas tentativas. Aguarde alguns minutos.' });
      }
      const gate = await requireAdmin(request, env, pathname);
      if (!gate.user) return gate.response;
      const body = await readJson(request);
      const action = String(body.action || '');
      const reason = cleanText(body.reason, 500);
      if (!['moderate', 'restore'].includes(action)) {
        return json(400, { error: 'Acao invalida. Use moderate ou restore.' });
      }
      const review = await env.DB.prepare('SELECT id, rating, comment, status FROM reviews WHERE id = ?')
        .bind(Number(params[0])).first();
      if (!review) return json(404, { error: 'Avaliacao nao encontrada.' });
      const next = action === 'moderate' ? 'moderated' : 'active';
      if (review.status === next || (action === 'moderate' && review.status === 'deleted')) {
        return json(409, { error: 'Transicao de status invalida para esta avaliacao.' });
      }
      await env.DB.batch([
        env.DB.prepare('UPDATE reviews SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(next, review.id),
        env.DB.prepare('INSERT INTO review_audit (review_id, actor_user_id, action, rating, comment, reason) VALUES (?, ?, ?, ?, ?, ?)')
          .bind(review.id, Number(gate.user.id), action === 'moderate' ? 'moderated' : 'restored', review.rating, review.comment, reason || null)
      ]);
      return json(200, { review: { id: Number(review.id), status: next } });
    },

    async conversationsList({ request, env, url, pathname }) {
      if (await isRateLimited(request, env, pathname, 10, 15 * 60 * 1000, env.AUTH_RATE_LIMITER)) {
        return json(429, { error: 'Muitas tentativas. Aguarde alguns minutos.' });
      }
      const gate = await requireAdmin(request, env, pathname);
      if (!gate.user) return gate.response;
      const status = String(url.searchParams.get('status') || 'active');
      if (status !== 'all' && !CONVERSATION_STATUSES.has(status)) {
        return json(400, { error: 'Filtro de status invalido.' });
      }
      const { limit } = paging(url);
      const rows = await env.DB.prepare(`
        SELECT c.id, c.status, c.last_message_at, c.updated_at,
          cu.name AS client_name, pu.name AS photographer_name
        FROM conversations c
        JOIN users cu ON cu.id = c.client_user_id
        JOIN users pu ON pu.id = c.photographer_user_id
        ${status === 'all' ? '' : 'WHERE c.status = ?'}
        ORDER BY c.updated_at DESC, c.id DESC LIMIT ?
      `).bind(...(status === 'all' ? [limit] : [status, limit])).all();
      return json(200, {
        conversations: (rows.results || []).map((row) => ({
          id: Number(row.id),
          status: row.status,
          clientName: row.client_name,
          photographerName: row.photographer_name,
          lastMessageAt: row.last_message_at,
          updatedAt: row.updated_at
        }))
      });
    },

    async conversationUpdate({ params, request, env, pathname }) {
      if (await isRateLimited(request, env, pathname, 10, 15 * 60 * 1000, env.AUTH_RATE_LIMITER)) {
        return json(429, { error: 'Muitas tentativas. Aguarde alguns minutos.' });
      }
      const gate = await requireAdmin(request, env, pathname);
      if (!gate.user) return gate.response;
      const body = await readJson(request);
      const action = String(body.action || '');
      if (!['close', 'reopen'].includes(action)) {
        return json(400, { error: 'Acao invalida. Use close ou reopen.' });
      }
      const conversation = await env.DB.prepare('SELECT id, status FROM conversations WHERE id = ?')
        .bind(Number(params[0])).first();
      if (!conversation) return json(404, { error: 'Conversa nao encontrada.' });
      const next = action === 'close' ? 'closed' : 'active';
      if (conversation.status === next) {
        return json(409, { error: 'Transicao de status invalida para esta conversa.' });
      }
      await env.DB.prepare('UPDATE conversations SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .bind(next, conversation.id).run();
      return json(200, { conversation: { id: Number(conversation.id), status: next } });
    }
  };
}

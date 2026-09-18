// Administrative handlers are isolated from the request router by dependency injection.
// Every route in this module requires an authenticated administrator (see requireAdmin).
export function createAdminHandlers(deps) {
  const { json, isRateLimited, authenticatedUser } = deps;

  async function requireAdmin(request, env, pathname) {
    const user = await authenticatedUser(request, env);
    if (!user) return { user: null, response: json(401, { error: 'Sessao nao encontrada.' }) };
    const fresh = await env.DB.prepare('SELECT is_admin FROM users WHERE id = ?').bind(Number(user.id)).first();
    if (!fresh || Number(fresh.is_admin) !== 1) {
      return { user: null, response: json(403, { error: 'Acesso restrito.' }) };
    }
    return { user, response: null };
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
    }
  };
}

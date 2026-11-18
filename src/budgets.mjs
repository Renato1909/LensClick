export function createBudgetHandlers({ json, cleanText, authenticatedUser, isRateLimited, readJson }) {
  function proposal(row) {
    return {
      id: Number(row.id),
      requestId: Number(row.request_id),
      priceCents: Number(row.price_cents),
      conditions: row.conditions || '',
      status: row.status,
      createdAt: row.created_at
    };
  }

  function budgetRequest(row, extra = {}) {
    return {
      id: Number(row.id),
      eventType: row.event_type,
      eventDate: row.event_date,
      place: row.place,
      duration: row.duration || '',
      description: row.description,
      additionalInfo: row.additional_info || '',
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      ...extra
    };
  }

  async function requestCreate({ params, request, env, pathname }) {
    if (await isRateLimited(request, env, pathname, 10, 60 * 60 * 1000, env.CONTENT_RATE_LIMITER)) {
      return json(429, { error: 'Muitos pedidos. Aguarde antes de tentar novamente.', code: 'rate_limited' });
    }
    const current = await authenticatedUser(request, env);
    if (!current) return json(401, { error: 'Faca login novamente.', code: 'unauthenticated' });
    if (current.role !== 'client') return json(403, { error: 'Somente clientes podem solicitar orcamentos.', code: 'forbidden_role' });
    const [slug] = params;
    const photographer = await env.DB.prepare(`
      SELECT p.user_id, p.slug FROM professional_profiles p
      JOIN users u ON u.id = p.user_id
      WHERE p.slug = ? AND p.is_published = 1 AND u.role = 'photographer'
    `).bind(slug).first();
    if (!photographer) return json(404, { error: 'Perfil profissional nao encontrado.', code: 'not_found' });
    if (photographer.user_id === current.id) return json(403, { error: 'Nao e permitido solicitar orcamento do proprio perfil.', code: 'forbidden_own_profile' });
    const body = await readJson(request);
    const eventType = cleanText(body.eventType, 80);
    const eventDate = String(body.eventDate ?? '').trim();
    const place = cleanText(body.place, 160);
    const duration = cleanText(body.duration, 80);
    const description = cleanText(body.description, 1000);
    const additionalInfo = cleanText(body.additionalInfo, 1000);
    if (eventType.length < 2) return json(400, { error: 'Informe o tipo de evento.', code: 'invalid_payload' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return json(400, { error: 'Informe a data do evento (AAAA-MM-DD).', code: 'invalid_payload' });
    if (place.length < 2) return json(400, { error: 'Informe o local do evento.', code: 'invalid_payload' });
    if (description.length < 10) return json(400, { error: 'Descreva o evento em pelo menos 10 caracteres.', code: 'invalid_payload' });
    const active = await env.DB.prepare(`
      SELECT id FROM budget_requests
      WHERE client_user_id = ? AND photographer_user_id = ? AND status IN ('pending', 'proposed')
    `).bind(current.id, photographer.user_id).first();
    if (active) return json(409, { error: 'Ja existe um pedido em andamento com este fotografo.', code: 'conflict' });
    const result = await env.DB.prepare(`
      INSERT INTO budget_requests (client_user_id, photographer_user_id, event_type, event_date, place, duration, description, additional_info)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(current.id, photographer.user_id, eventType, eventDate, place, duration || null, description, additionalInfo || null).run();
    const requestId = Number(result.meta.last_row_id);
    await env.DB.prepare("INSERT INTO budget_audit (request_id, actor_user_id, action) VALUES (?, ?, 'created')")
      .bind(requestId, current.id).run();
    return json(201, { request: { id: requestId, status: 'pending' }, message: 'Pedido de orcamento enviado.' });
  }

  async function requestsList({ request, env }) {
    const current = await authenticatedUser(request, env);
    if (!current) return json(401, { error: 'Faca login novamente.', code: 'unauthenticated' });
    const isPhotographer = current.role === 'photographer';
    const filterColumn = isPhotographer ? 'b.photographer_user_id' : 'b.client_user_id';
    const joinColumn = isPhotographer ? 'b.client_user_id' : 'b.photographer_user_id';
    const rows = await env.DB.prepare(`
      SELECT b.*, u.name AS counterpart_name
      FROM budget_requests b JOIN users u ON u.id = ${joinColumn}
      WHERE ${filterColumn} = ?
      ORDER BY b.created_at DESC, b.id DESC
    `).bind(current.id).all();
    return json(200, {
      role: current.role,
      requests: rows.results.map((row) => budgetRequest(row, { counterpartName: row.counterpart_name }))
    });
  }

  async function requestDetail({ params, request, env }) {
    const current = await authenticatedUser(request, env);
    if (!current) return json(401, { error: 'Faca login novamente.', code: 'unauthenticated' });
    const [requestId] = params;
    const row = await env.DB.prepare('SELECT * FROM budget_requests WHERE id = ?').bind(Number(requestId)).first();
    if (!row) return json(404, { error: 'Pedido nao encontrado.', code: 'not_found' });
    if (row.client_user_id !== current.id && row.photographer_user_id !== current.id) {
      return json(403, { error: 'Acesso nao autorizado a este pedido.', code: 'forbidden_not_participant' });
    }
    const proposals = await env.DB.prepare('SELECT * FROM proposals WHERE request_id = ? ORDER BY created_at DESC, id DESC')
      .bind(row.id).all();
    return json(200, { request: budgetRequest(row, { proposals: proposals.results.map(proposal) }) });
  }

  async function proposalCreate({ params, request, env, pathname }) {
    if (await isRateLimited(request, env, pathname, 20, 60 * 60 * 1000, env.CONTENT_RATE_LIMITER)) {
      return json(429, { error: 'Muitas propostas. Aguarde antes de tentar novamente.', code: 'rate_limited' });
    }
    const current = await authenticatedUser(request, env);
    if (!current) return json(401, { error: 'Faca login novamente.', code: 'unauthenticated' });
    if (current.role !== 'photographer') return json(403, { error: 'Somente fotografos podem enviar propostas.', code: 'forbidden_role' });
    const [requestId] = params;
    const row = await env.DB.prepare('SELECT * FROM budget_requests WHERE id = ?').bind(Number(requestId)).first();
    if (!row) return json(404, { error: 'Pedido nao encontrado.', code: 'not_found' });
    if (row.photographer_user_id !== current.id) return json(403, { error: 'Este pedido nao pertence a voce.', code: 'forbidden_not_owner' });
    if (!['pending', 'proposed'].includes(row.status)) return json(409, { error: 'Este pedido nao aceita novas propostas.', code: 'invalid_state' });
    const body = await readJson(request);
    const priceCents = Number(body.priceCents);
    const conditions = cleanText(body.conditions, 1000);
    if (!Number.isInteger(priceCents) || priceCents < 0 || priceCents > 100000000) {
      return json(400, { error: 'Informe um preco valido em centavos.', code: 'invalid_payload' });
    }
    const existingPending = await env.DB.prepare("SELECT id FROM proposals WHERE request_id = ? AND status = 'pending'")
      .bind(row.id).first();
    if (existingPending) return json(409, { error: 'Ja existe uma proposta pendente para este pedido.', code: 'conflict' });
    const result = await env.DB.prepare('INSERT INTO proposals (request_id, photographer_user_id, price_cents, conditions) VALUES (?, ?, ?, ?)')
      .bind(row.id, current.id, priceCents, conditions || null).run();
    await env.DB.batch([
      env.DB.prepare("UPDATE budget_requests SET status = 'proposed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(row.id),
      env.DB.prepare("INSERT INTO budget_audit (request_id, actor_user_id, action) VALUES (?, ?, 'proposed')").bind(row.id, current.id)
    ]);
    return json(201, { proposal: { id: Number(result.meta.last_row_id), status: 'pending' }, message: 'Proposta enviada.' });
  }

  async function requestAction({ params, request, env }) {
    const current = await authenticatedUser(request, env);
    if (!current) return json(401, { error: 'Faca login novamente.', code: 'unauthenticated' });
    const [requestId] = params;
    const body = await readJson(request);
    const action = String(body.action ?? '').trim();
    const row = await env.DB.prepare('SELECT * FROM budget_requests WHERE id = ?').bind(Number(requestId)).first();
    if (!row) return json(404, { error: 'Pedido nao encontrado.', code: 'not_found' });

    if (action === 'cancel') {
      if (row.client_user_id !== current.id) return json(403, { error: 'Somente o cliente pode cancelar este pedido.', code: 'forbidden_role' });
      if (!['pending', 'proposed'].includes(row.status)) return json(409, { error: 'Este pedido nao pode ser cancelado.', code: 'invalid_state' });
      await env.DB.batch([
        env.DB.prepare("UPDATE budget_requests SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(row.id),
        env.DB.prepare("UPDATE proposals SET status = 'withdrawn', updated_at = CURRENT_TIMESTAMP WHERE request_id = ? AND status = 'pending'").bind(row.id),
        env.DB.prepare("INSERT INTO budget_audit (request_id, actor_user_id, action) VALUES (?, ?, 'cancelled')").bind(row.id, current.id)
      ]);
      return json(200, { request: { id: row.id, status: 'cancelled' }, message: 'Pedido cancelado.' });
    }

    if (action === 'accept' || action === 'reject') {
      if (row.client_user_id !== current.id) return json(403, { error: 'Somente o cliente pode decidir a proposta.', code: 'forbidden_role' });
      if (row.status !== 'proposed') return json(409, { error: 'Nao ha proposta para decidir.', code: 'invalid_state' });
      const proposalId = Number(body.proposalId);
      const prop = await env.DB.prepare("SELECT * FROM proposals WHERE id = ? AND request_id = ? AND status = 'pending'")
        .bind(proposalId, row.id).first();
      if (!prop) return json(404, { error: 'Proposta pendente nao encontrada.', code: 'not_found' });
      const newStatus = action === 'accept' ? 'accepted' : 'rejected';
      await env.DB.batch([
        env.DB.prepare('UPDATE proposals SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(newStatus, prop.id),
        env.DB.prepare("UPDATE proposals SET status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE request_id = ? AND status = 'pending' AND id <> ?").bind(row.id, prop.id),
        env.DB.prepare('UPDATE budget_requests SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(newStatus, row.id),
        env.DB.prepare('INSERT INTO budget_audit (request_id, actor_user_id, action) VALUES (?, ?, ?)').bind(row.id, current.id, newStatus)
      ]);
      return json(200, { request: { id: row.id, status: newStatus }, message: action === 'accept' ? 'Proposta aceita.' : 'Proposta recusada.' });
    }

    if (action === 'withdraw') {
      if (row.photographer_user_id !== current.id) return json(403, { error: 'Somente o fotografo pode retirar a proposta.', code: 'forbidden_role' });
      const proposalId = Number(body.proposalId);
      const prop = await env.DB.prepare("SELECT * FROM proposals WHERE id = ? AND request_id = ? AND status = 'pending'")
        .bind(proposalId, row.id).first();
      if (!prop) return json(404, { error: 'Proposta pendente nao encontrada.', code: 'not_found' });
      await env.DB.batch([
        env.DB.prepare("UPDATE proposals SET status = 'withdrawn', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(prop.id),
        env.DB.prepare("UPDATE budget_requests SET status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'proposed'").bind(row.id),
        env.DB.prepare("INSERT INTO budget_audit (request_id, actor_user_id, action) VALUES (?, ?, 'withdrawn')").bind(row.id, current.id)
      ]);
      return json(200, { request: { id: row.id, status: 'pending' }, message: 'Proposta retirada.' });
    }

    return json(400, { error: 'Acao invalida.', code: 'invalid_payload' });
  }

  async function agenda({ request, env }) {
    const current = await authenticatedUser(request, env);
    if (!current) return json(401, { error: 'Faca login novamente.', code: 'unauthenticated' });
    if (current.role !== 'photographer') return json(403, { error: 'Somente fotografos possuem agenda.', code: 'forbidden_role' });
    const rows = await env.DB.prepare(`
      SELECT b.*, u.name AS client_name
      FROM budget_requests b JOIN users u ON u.id = b.client_user_id
      WHERE b.photographer_user_id = ? AND b.status = 'accepted'
      ORDER BY b.event_date ASC, b.id ASC
    `).bind(current.id).all();
    return json(200, { events: rows.results.map((row) => budgetRequest(row, { clientName: row.client_name })) });
  }

  async function favoritesList({ request, env }) {
    const current = await authenticatedUser(request, env);
    if (!current) return json(401, { error: 'Faca login novamente.', code: 'unauthenticated' });
    if (current.role !== 'client') return json(403, { error: 'Somente clientes possuem favoritos.', code: 'forbidden_role' });
    const rows = await env.DB.prepare(`
      SELECT f.photographer_user_id, f.created_at, p.slug, u.name
      FROM favorites f
      JOIN professional_profiles p ON p.user_id = f.photographer_user_id
      JOIN users u ON u.id = f.photographer_user_id
      WHERE f.client_user_id = ?
      ORDER BY f.created_at DESC, f.id DESC
    `).bind(current.id).all();
    return json(200, {
      favorites: rows.results.map((row) => ({
        photographerId: Number(row.photographer_user_id), slug: row.slug, name: row.name, createdAt: row.created_at
      }))
    });
  }

  async function favoriteAdd({ request, env, pathname }) {
    if (await isRateLimited(request, env, pathname, 30, 60 * 60 * 1000, env.CONTENT_RATE_LIMITER)) {
      return json(429, { error: 'Muitas alteracoes. Aguarde antes de tentar novamente.', code: 'rate_limited' });
    }
    const current = await authenticatedUser(request, env);
    if (!current) return json(401, { error: 'Faca login novamente.', code: 'unauthenticated' });
    if (current.role !== 'client') return json(403, { error: 'Somente clientes podem favoritar fotografos.', code: 'forbidden_role' });
    const body = await readJson(request);
    const slug = String(body.slug ?? '').trim();
    const photographer = await env.DB.prepare(`
      SELECT p.user_id FROM professional_profiles p
      JOIN users u ON u.id = p.user_id
      WHERE p.slug = ? AND p.is_published = 1 AND u.role = 'photographer'
    `).bind(slug).first();
    if (!photographer) return json(404, { error: 'Perfil profissional nao encontrado.', code: 'not_found' });
    if (photographer.user_id === current.id) return json(403, { error: 'Nao e permitido favoritar o proprio perfil.', code: 'forbidden_own_profile' });
    await env.DB.prepare('INSERT INTO favorites (client_user_id, photographer_user_id) VALUES (?, ?) ON CONFLICT(client_user_id, photographer_user_id) DO NOTHING')
      .bind(current.id, photographer.user_id).run();
    return json(201, { favorite: { slug }, message: 'Fotografo adicionado aos favoritos.' });
  }

  async function favoriteRemove({ params, request, env }) {
    const current = await authenticatedUser(request, env);
    if (!current) return json(401, { error: 'Faca login novamente.', code: 'unauthenticated' });
    if (current.role !== 'client') return json(403, { error: 'Somente clientes podem remover favoritos.', code: 'forbidden_role' });
    const [photographerId] = params;
    await env.DB.prepare('DELETE FROM favorites WHERE client_user_id = ? AND photographer_user_id = ?')
      .bind(current.id, Number(photographerId)).run();
    return json(200, { message: 'Favorito removido.' });
  }

  return { requestCreate, requestsList, requestDetail, proposalCreate, requestAction, agenda, favoritesList, favoriteAdd, favoriteRemove };
}
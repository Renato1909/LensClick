const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_-]{8,200}$/;

async function sha256Hex(text) {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
  return `{${entries.join(',')}}`;
}

export function createBudgetHandlers({ json, cleanText, authenticatedUser, isRateLimited, readJson }) {
  // Idempotencia: o Android envia Idempotency-Key em mutacoes; replay da mesma
  // chave + mesmo payload devolve a resposta gravada (sem reexecutar a escrita).
  // Somente respostas 2xx sao gravadas; erros reexecutam normalmente.
  async function idempotencyStart(current, route, body, request, env) {
    const rawKey = request.headers.get('Idempotency-Key');
    if (rawKey == null) return null;
    const key = rawKey.trim();
    if (!IDEMPOTENCY_KEY_RE.test(key)) {
      return { response: json(400, { error: 'Idempotency-Key invalida. Use 8-200 caracteres alfanumericos, "-" ou "_".', code: 'invalid_payload' }) };
    }
    const requestHash = await sha256Hex(`${route}\n${stableStringify(body ?? null)}`);
    const row = await env.DB.prepare('SELECT request_hash, status, response_body FROM idempotency_keys WHERE key = ? AND user_id = ? AND route = ?')
      .bind(key, current.id, route).first();
    if (row) {
      if (row.request_hash === requestHash) {
        return { response: json(row.status, JSON.parse(row.response_body), { 'Idempotency-Replayed': 'true' }) };
      }
      return { response: json(409, { error: 'A chave de idempotencia ja foi usada com outro conteudo.', code: 'idempotency_key_reuse' }) };
    }
    return { key, route, requestHash };
  }

  async function idempotencyFinish(idem, current, env, status, payload) {
    if (!idem || idem.response || status < 200 || status >= 300) {
      return json(status, payload);
    }
    await env.DB.batch([
      env.DB.prepare('INSERT INTO idempotency_keys (key, user_id, route, request_hash, status, response_body) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(key, user_id, route) DO NOTHING')
        .bind(idem.key, current.id, idem.route, idem.requestHash, status, JSON.stringify(payload)),
      env.DB.prepare("DELETE FROM idempotency_keys WHERE created_at < datetime('now', '-7 days')")
    ]);
    return json(status, payload, { 'Idempotency-Replayed': 'false' });
  }

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
    const idem = await idempotencyStart(current, 'budgets.request.create', body, request, env);
    if (idem?.response) return idem.response;
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
    return idempotencyFinish(idem, current, env, 201, { request: { id: requestId, status: 'pending' }, message: 'Pedido de orcamento enviado.' });
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
    const row = await env.DB.prepare(`
      SELECT b.*, p.slug AS photographer_slug, p.specialties, u.name AS photographer_name
      FROM budget_requests b JOIN users u ON u.id = b.photographer_user_id
      LEFT JOIN professional_profiles p ON p.user_id = b.photographer_user_id
      WHERE b.id = ?`).bind(Number(requestId)).first();
    if (!row) return json(404, { error: 'Pedido nao encontrado.', code: 'not_found' });
    if (row.client_user_id !== current.id && row.photographer_user_id !== current.id) {
      return json(403, { error: 'Acesso nao autorizado a este pedido.', code: 'forbidden_not_participant' });
    }
    const proposals = await env.DB.prepare('SELECT * FROM proposals WHERE request_id = ? ORDER BY created_at DESC, id DESC')
      .bind(row.id).all();
    const history = await env.DB.prepare('SELECT action, created_at FROM budget_audit WHERE request_id = ? ORDER BY id')
      .bind(row.id).all();
    return json(200, { request: budgetRequest(row, {
      photographerSlug: row.photographer_slug || '',
      photographerName: row.photographer_name,
      photographerSpecialties: JSON.parse(row.specialties || '[]'),
      proposals: proposals.results.map(proposal),
      history: history.results.map(event => ({ action: event.action, createdAt: event.created_at }))
    }) });
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
    const idem = await idempotencyStart(current, `budgets.proposal.create:${params[0]}`, body, request, env);
    if (idem?.response) return idem.response;
    const priceCents = Number(body.priceCents);
    const conditions = cleanText(body.conditions, 1000);
    if (!Number.isInteger(priceCents) || priceCents < 0 || priceCents > 100000000) {
      return json(400, { error: 'Informe um preco valido em centavos.', code: 'invalid_payload' });
    }
    const [inserted] = await env.DB.batch([
      env.DB.prepare(`INSERT INTO proposals (request_id, photographer_user_id, price_cents, conditions)
        SELECT id, ?, ?, ? FROM budget_requests
        WHERE id = ? AND status IN ('pending', 'proposed')
          AND NOT EXISTS (SELECT 1 FROM proposals WHERE request_id = ? AND status = 'pending')`)
        .bind(current.id, priceCents, conditions || null, row.id, row.id),
      env.DB.prepare(`INSERT INTO budget_audit (request_id, actor_user_id, action)
        SELECT ?, ?, 'proposed' WHERE changes() = 1`).bind(row.id, current.id),
      env.DB.prepare(`UPDATE budget_requests SET status = 'proposed', updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND changes() = 1`).bind(row.id)
    ]);
    if (!inserted.meta.changes) return json(409, { error: 'O pedido foi encerrado ou ja tem uma proposta pendente.', code: 'conflict' });
    return idempotencyFinish(idem, current, env, 201, { proposal: { id: Number(inserted.meta.last_row_id), status: 'pending' }, message: 'Proposta enviada.' });
  }

  async function requestAction({ params, request, env }) {
    const current = await authenticatedUser(request, env);
    if (!current) return json(401, { error: 'Faca login novamente.', code: 'unauthenticated' });
    const [requestId] = params;
    const body = await readJson(request);
    const idem = await idempotencyStart(current, `budgets.request.action:${requestId}`, body, request, env);
    if (idem?.response) return idem.response;
    const action = String(body.action ?? '').trim();
    const row = await env.DB.prepare('SELECT * FROM budget_requests WHERE id = ?').bind(Number(requestId)).first();
    if (!row) return json(404, { error: 'Pedido nao encontrado.', code: 'not_found' });

    if (action === 'cancel' || action === 'decline') {
      const isDecline = action === 'decline';
      const ownerId = isDecline ? row.photographer_user_id : row.client_user_id;
      if (ownerId !== current.id) return json(403, { error: 'Acesso nao autorizado a este pedido.', code: 'forbidden_role' });
      const status = isDecline ? 'rejected' : 'cancelled';
      const eligible = "id = ? AND status IN ('pending', 'proposed')";
      const [, , updated] = await env.DB.batch([
        env.DB.prepare(`INSERT INTO budget_audit (request_id, actor_user_id, action)
          SELECT id, ?, ? FROM budget_requests WHERE ${eligible}`).bind(current.id, status, row.id),
        env.DB.prepare(`UPDATE proposals SET status = 'withdrawn', updated_at = CURRENT_TIMESTAMP
          WHERE request_id IN (SELECT id FROM budget_requests WHERE ${eligible}) AND status = 'pending'`).bind(row.id),
        env.DB.prepare(`UPDATE budget_requests SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE ${eligible}`).bind(status, row.id)
      ]);
      if (!updated.meta.changes) return json(409, { error: 'Este pedido ja foi encerrado.', code: 'invalid_state' });
      return idempotencyFinish(idem, current, env, 200, {
        request: { id: row.id, status }, message: isDecline ? 'Pedido recusado.' : 'Pedido cancelado.'
      });
    }

    if (action === 'accept' || action === 'reject') {
      if (row.client_user_id !== current.id) return json(403, { error: 'Somente o cliente pode decidir a proposta.', code: 'forbidden_role' });
      if (row.status !== 'proposed') return json(409, { error: 'Nao ha proposta para decidir.', code: 'invalid_state' });
      const proposalId = Number(body.proposalId);
      const prop = await env.DB.prepare("SELECT * FROM proposals WHERE id = ? AND request_id = ? AND status = 'pending'")
        .bind(proposalId, row.id).first();
      if (!prop) return json(404, { error: 'Proposta pendente nao encontrada.', code: 'not_found' });
      const newStatus = action === 'accept' ? 'accepted' : 'rejected';
      const [updated] = await env.DB.batch([
        env.DB.prepare(`UPDATE proposals SET status = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status = 'pending' AND request_id IN (SELECT id FROM budget_requests WHERE id = ? AND status = 'proposed')`)
          .bind(newStatus, prop.id, row.id),
        env.DB.prepare(`UPDATE budget_requests SET status = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND changes() = 1`).bind(newStatus, row.id),
        env.DB.prepare(`INSERT INTO budget_audit (request_id, actor_user_id, action)
          SELECT ?, ?, ? WHERE changes() = 1`).bind(row.id, current.id, newStatus)
      ]);
      if (!updated.meta.changes) return json(409, { error: 'O pedido foi encerrado.', code: 'invalid_state' });
      return idempotencyFinish(idem, current, env, 200, { request: { id: row.id, status: newStatus }, message: action === 'accept' ? 'Proposta aceita.' : 'Proposta recusada.' });
    }

    if (action === 'withdraw') {
      if (row.photographer_user_id !== current.id) return json(403, { error: 'Somente o fotografo pode retirar a proposta.', code: 'forbidden_role' });
      const proposalId = Number(body.proposalId);
      const prop = await env.DB.prepare("SELECT * FROM proposals WHERE id = ? AND request_id = ? AND status = 'pending'")
        .bind(proposalId, row.id).first();
      if (!prop) return json(404, { error: 'Proposta pendente nao encontrada.', code: 'not_found' });
      const [updated] = await env.DB.batch([
        env.DB.prepare(`UPDATE proposals SET status = 'withdrawn', updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status = 'pending' AND request_id IN (SELECT id FROM budget_requests WHERE id = ? AND status = 'proposed')`)
          .bind(prop.id, row.id),
        env.DB.prepare(`UPDATE budget_requests SET status = 'pending', updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND changes() = 1`).bind(row.id),
        env.DB.prepare(`INSERT INTO budget_audit (request_id, actor_user_id, action)
          SELECT ?, ?, 'withdrawn' WHERE changes() = 1`).bind(row.id, current.id)
      ]);
      if (!updated.meta.changes) return json(409, { error: 'O pedido foi encerrado.', code: 'invalid_state' });
      return idempotencyFinish(idem, current, env, 200, { request: { id: row.id, status: 'pending' }, message: 'Proposta retirada.' });
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
    const idem = await idempotencyStart(current, 'budgets.favorites.add', body, request, env);
    if (idem?.response) return idem.response;
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
    return idempotencyFinish(idem, current, env, 201, { favorite: { slug }, message: 'Fotografo adicionado aos favoritos.' });
  }

  async function favoriteRemove({ params, request, env }) {
    const current = await authenticatedUser(request, env);
    if (!current) return json(401, { error: 'Faca login novamente.', code: 'unauthenticated' });
    if (current.role !== 'client') return json(403, { error: 'Somente clientes podem remover favoritos.', code: 'forbidden_role' });
    const [photographerId] = params;
    const idem = await idempotencyStart(current, `budgets.favorites.remove:${photographerId}`, null, request, env);
    if (idem?.response) return idem.response;
    await env.DB.prepare('DELETE FROM favorites WHERE client_user_id = ? AND photographer_user_id = ?')
      .bind(current.id, Number(photographerId)).run();
    return idempotencyFinish(idem, current, env, 200, { message: 'Favorito removido.' });
  }

  return { requestCreate, requestsList, requestDetail, proposalCreate, requestAction, agenda, favoritesList, favoriteAdd, favoriteRemove };
}
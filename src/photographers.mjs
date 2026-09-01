export function createPhotographerHandlers({
  json,
  cleanText,
  professionalProfile,
  portfolioItem,
  professionalSpecialties,
  publicReview,
  storedImageResponse,
  isRateLimited,
  authenticatedUser,
  readJson,
  slugify
}) {
  async function list({ request, env }) {
    const url = new URL(request.url);
    const city = cleanText(url.searchParams.get('city'), 80);
    const state = cleanText(url.searchParams.get('state'), 2).toUpperCase();
    const specialty = cleanText(url.searchParams.get('specialty'), 30);
    const availability = url.searchParams.get('availability');
    const minPrice = url.searchParams.has('minPrice') ? Number(url.searchParams.get('minPrice')) : null;
    const maxPrice = url.searchParams.has('maxPrice') ? Number(url.searchParams.get('maxPrice')) : null;
    const minRadius = url.searchParams.has('minRadius') ? Number(url.searchParams.get('minRadius')) : null;
    const sort = url.searchParams.get('sort') || 'recommended';
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get('pageSize')) || 12));
    const validAvailabilities = ['available', 'limited', 'unavailable'];
    const orderBy = {
      recommended: "CASE p.availability WHEN 'available' THEN 0 WHEN 'limited' THEN 1 ELSE 2 END, p.updated_at DESC",
      recent: 'p.updated_at DESC',
      price_asc: 'p.starting_price_cents IS NULL, p.starting_price_cents ASC, p.updated_at DESC',
      price_desc: 'p.starting_price_cents IS NULL, p.starting_price_cents DESC, p.updated_at DESC',
      radius_desc: 'p.service_radius_km IS NULL, p.service_radius_km DESC, p.updated_at DESC',
      rating_desc: 'rating_average IS NULL, rating_average DESC, review_count DESC, p.updated_at DESC'
    };
    const selectedSort = Object.hasOwn(orderBy, sort) ? sort : 'recommended';
    const whereClauses = ['p.is_published = 1', "u.role = 'photographer'"];
    const params = [];
    if (state && /^[A-Z]{2}$/.test(state)) { whereClauses.push('p.state = ?'); params.push(state); }
    if (city) { whereClauses.push('p.city LIKE ?'); params.push(`%${city}%`); }
    if (specialty && professionalSpecialties.has(specialty)) { whereClauses.push('p.specialties LIKE ?'); params.push(`%"${specialty}"%`); }
    if (availability && validAvailabilities.includes(availability)) { whereClauses.push('p.availability = ?'); params.push(availability); }
    if (minPrice != null && Number.isFinite(minPrice) && minPrice >= 0) { whereClauses.push('p.starting_price_cents >= ?'); params.push(Math.round(minPrice * 100)); }
    if (maxPrice != null && Number.isFinite(maxPrice) && maxPrice >= 0) { whereClauses.push('p.starting_price_cents <= ?'); params.push(Math.round(maxPrice * 100)); }
    if (minRadius != null && Number.isFinite(minRadius) && minRadius >= 0 && minRadius <= 1000) { whereClauses.push('p.service_radius_km >= ?'); params.push(Math.round(minRadius)); }
    const whereSql = whereClauses.join(' AND ');
    const offset = (page - 1) * pageSize;
    const totalResult = await env.DB.prepare(`SELECT COUNT(*) AS total FROM professional_profiles p JOIN users u ON u.id = p.user_id WHERE ${whereSql}`).bind(...params).first();
    const total = Number(totalResult?.total || 0);
    const profiles = await env.DB.prepare(`
      SELECT p.*, u.name, u.profile_pic_key, u.updated_at AS user_updated_at,
        (SELECT ROUND(AVG(r.rating), 2) FROM reviews r WHERE r.photographer_user_id = p.user_id AND r.status = 'active') AS rating_average,
        (SELECT COUNT(*) FROM reviews r WHERE r.photographer_user_id = p.user_id AND r.status = 'active') AS review_count
      FROM professional_profiles p JOIN users u ON u.id = p.user_id WHERE ${whereSql}
      ORDER BY ${orderBy[selectedSort]} LIMIT ? OFFSET ?
    `).bind(...params, pageSize, offset).all();
    return json(200, {
      photographers: (profiles.results || []).map((row) => professionalProfile(row)),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      sort: selectedSort
    }, { 'Cache-Control': 'public, max-age=60' });
  }

  async function detail({ params, env }) {
    const [slug] = params;
    const profile = await env.DB.prepare(`
      SELECT p.*, u.name, u.profile_pic_key, u.updated_at AS user_updated_at,
        (SELECT ROUND(AVG(r.rating), 2) FROM reviews r WHERE r.photographer_user_id = p.user_id AND r.status = 'active') AS rating_average,
        (SELECT COUNT(*) FROM reviews r WHERE r.photographer_user_id = p.user_id AND r.status = 'active') AS review_count
      FROM professional_profiles p JOIN users u ON u.id = p.user_id
      WHERE p.slug = ? AND p.is_published = 1 AND u.role = 'photographer'
    `).bind(slug).first();
    if (!profile) return json(404, { error: 'Perfil profissional nao encontrado.' });
    const portfolio = await env.DB.prepare('SELECT id, caption, alt_text, position, updated_at FROM portfolio_items WHERE user_id = ? ORDER BY position, id').bind(profile.user_id).all();
    return json(200, { profile: { ...professionalProfile(profile), portfolio: portfolio.results.map((item) => portfolioItem(item, profile.slug)) } }, { 'Cache-Control': 'public, max-age=60' });
  }

  async function photo({ params, env, request }) {
    const [slug] = params;
    const profile = await env.DB.prepare(`
      SELECT p.slug, u.profile_pic_key FROM professional_profiles p
      JOIN users u ON u.id = p.user_id
      WHERE p.slug = ? AND p.is_published = 1 AND u.role = 'photographer'
    `).bind(slug).first();
    if (!profile?.profile_pic_key) return json(404, { error: 'Imagem nao encontrada.' });
    return storedImageResponse(await env.PROFILE_IMAGES.get(profile.profile_pic_key), request, 'public, max-age=300, must-revalidate');
  }

  async function portfolioImage({ params, env, request }) {
    const [slug, itemId] = params;
    const item = await env.DB.prepare(`
      SELECT i.object_key FROM portfolio_items i
      JOIN professional_profiles p ON p.user_id = i.user_id
      JOIN users u ON u.id = i.user_id
      WHERE p.slug = ? AND i.id = ? AND p.is_published = 1 AND u.role = 'photographer'
    `).bind(slug, Number(itemId)).first();
    if (!item) return json(404, { error: 'Imagem nao encontrada.' });
    return storedImageResponse(await env.PROFILE_IMAGES.get(item.object_key), request, 'public, max-age=300, must-revalidate');
  }

  async function reviews({ params, env }) {
    const [slug] = params;
    const photographer = await env.DB.prepare(`
      SELECT p.user_id FROM professional_profiles p JOIN users u ON u.id = p.user_id
      WHERE p.slug = ? AND p.is_published = 1 AND u.role = 'photographer'
    `).bind(slug).first();
    if (!photographer) return json(404, { error: 'Perfil profissional nao encontrado.' });
    const summary = await env.DB.prepare(`
      SELECT COUNT(*) AS total, ROUND(AVG(rating), 2) AS average
      FROM reviews WHERE photographer_user_id = ? AND status = 'active'
    `).bind(photographer.user_id).first();
    const reviewRows = await env.DB.prepare(`
      SELECT r.id, r.rating, r.comment, r.created_at, r.updated_at, u.name AS client_name
      FROM reviews r JOIN users u ON u.id = r.client_user_id
      WHERE r.photographer_user_id = ? AND r.status = 'active'
      ORDER BY r.created_at DESC, r.id DESC LIMIT 50
    `).bind(photographer.user_id).all();
    return json(200, {
      summary: { total: Number(summary?.total || 0), average: summary?.average == null ? null : Number(summary.average) },
      reviews: reviewRows.results.map(publicReview)
    }, { 'Cache-Control': 'public, max-age=60' });
  }

  async function reviewRequestCreate({ params, request, env, pathname }) {
    if (await isRateLimited(request, env, pathname, 10, 60 * 60 * 1000, env.CONTENT_RATE_LIMITER)) {
      return json(429, { error: 'Muitas solicitacoes. Aguarde antes de tentar novamente.' });
    }
    const [slug] = params;
    const current = await authenticatedUser(request, env);
    if (!current) return json(401, { error: 'Faca login como cliente para solicitar contato.' });
    if (current.role !== 'client') return json(403, { error: 'Somente clientes podem solicitar contato para avaliacao.' });
    const photographer = await env.DB.prepare(`
      SELECT p.user_id FROM professional_profiles p JOIN users u ON u.id = p.user_id
      WHERE p.slug = ? AND p.is_published = 1 AND u.role = 'photographer'
    `).bind(slug).first();
    if (!photographer) return json(404, { error: 'Perfil profissional nao encontrado.' });
    if (photographer.user_id === current.id) return json(403, { error: 'Nao e permitido solicitar avaliacao do proprio perfil.' });
    const body = await readJson(request);
    const message = cleanText(body.message, 1000);
    if (message.length < 10) return json(400, { error: 'Descreva o contato em pelo menos 10 caracteres.' });
    const pending = await env.DB.prepare(`
      SELECT id FROM review_requests WHERE client_user_id = ? AND photographer_user_id = ? AND status = 'pending'
    `).bind(current.id, photographer.user_id).first();
    if (pending) return json(409, { error: 'Ja existe uma solicitacao aguardando confirmacao deste fotografo.' });
    const result = await env.DB.prepare('INSERT INTO review_requests (client_user_id, photographer_user_id, message) VALUES (?, ?, ?)')
      .bind(current.id, photographer.user_id, message).run();
    return json(201, { request: { id: Number(result.meta.last_row_id), status: 'pending' }, message: 'Solicitacao enviada ao fotografo.' });
  }

  async function conversationCreate({ params, request, env, pathname }) {
    if (await isRateLimited(request, env, pathname, 12, 60 * 60 * 1000, env.CONTENT_RATE_LIMITER)) {
      return json(429, { error: 'Limite de mensagens atingido. Tente mais tarde.' });
    }
    const current = await authenticatedUser(request, env);
    if (!current) return json(401, { error: 'Faca login novamente.' });
    if (current.role !== 'client') return json(403, { error: 'Somente clientes podem iniciar conversas.' });
    const [slug] = params;
    const photographer = await env.DB.prepare(`
      SELECT p.user_id, p.slug FROM professional_profiles p
      JOIN users u ON u.id = p.user_id
      WHERE p.slug = ? AND p.is_published = 1 AND u.role = 'photographer'
    `).bind(slug).first();
    if (!photographer) return json(404, { error: 'Perfil profissional nao encontrado.' });
    const body = String((await readJson(request)).message ?? '').trim();
    if (!body) return json(400, { error: 'Escreva uma mensagem para iniciar a conversa.' });
    if (body.length > 2000) return json(400, { error: 'A mensagem deve ter no maximo 2000 caracteres.' });
    const existing = await env.DB.prepare('SELECT id, status FROM conversations WHERE client_user_id = ? AND photographer_user_id = ?')
      .bind(current.id, photographer.user_id).first();
    if (existing?.status === 'closed') return json(409, { error: 'Esta conversa esta encerrada.' });
    const creationResults = await env.DB.batch([
      env.DB.prepare('INSERT INTO conversations (client_user_id, photographer_user_id) VALUES (?, ?) ON CONFLICT(client_user_id, photographer_user_id) DO NOTHING').bind(current.id, photographer.user_id),
      env.DB.prepare('INSERT INTO messages (conversation_id, sender_user_id, body) SELECT id, ?, ? FROM conversations WHERE client_user_id = ? AND photographer_user_id = ? AND status = \'active\'').bind(current.id, body, current.id, photographer.user_id),
      env.DB.prepare('UPDATE conversations SET last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE client_user_id = ? AND photographer_user_id = ? AND status = \'active\'').bind(current.id, photographer.user_id)
    ]);
    if (Number(creationResults[1]?.meta?.changes || 0) !== 1) return json(409, { error: 'Nao foi possivel iniciar esta conversa.' });
    const conversation = await env.DB.prepare('SELECT id FROM conversations WHERE client_user_id = ? AND photographer_user_id = ?')
      .bind(current.id, photographer.user_id).first();
    return json(existing ? 200 : 201, { conversation: { id: Number(conversation.id) } });
  }

  async function professionalProfileRead({ request, env }) {
    const current = await authenticatedUser(request, env);
    if (!current) return json(401, { error: 'Faca login novamente.' });
    const profile = await env.DB.prepare('SELECT * FROM professional_profiles WHERE user_id = ?').bind(current.id).first();
    return json(200, {
      profile: profile ? professionalProfile(profile, true) : {
        slug: `${slugify(current.name)}-${current.id}`,
        bio: '', specialties: [], city: '', state: '', serviceRadiusKm: null,
        startingPriceCents: null, availability: 'available', publicEmail: '', publicPhone: '',
        instagram: '', website: '', showEmail: false, showPhone: false, isPublished: false
      }
    });
  }

  return { list, detail, photo, portfolioImage, reviews, reviewRequestCreate, conversationCreate, professionalProfileRead };
}

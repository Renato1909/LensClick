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
  slugify,
  normalizeEmail,
  isValidEmail,
  normalizeWebsite,
  parseSpecialties,
  accountReviewRequest
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

  async function professionalProfileUpdate({ request, env, pathname }) {
    if (await isRateLimited(request, env, pathname, 30, 60 * 60 * 1000, env.ACCOUNT_RATE_LIMITER)) return json(429, { error: 'Muitas alteracoes. Aguarde antes de tentar novamente.' });
    const current = await authenticatedUser(request, env);
    if (!current) return json(401, { error: 'Faca login novamente.' });
    if (current.role !== 'photographer') return json(403, { error: 'Selecione o perfil de fotografo nos dados pessoais para continuar.' });
    const body = await readJson(request);
    const bio = cleanText(body.bio, 1200), specialties = parseSpecialties(body.specialties), city = cleanText(body.city, 80);
    const state = cleanText(body.state, 2).toUpperCase();
    const availability = ['available', 'limited', 'unavailable'].includes(body.availability) ? body.availability : 'available';
    const serviceRadiusKm = body.serviceRadiusKm === '' || body.serviceRadiusKm == null ? null : Number(body.serviceRadiusKm);
    const startingPriceCents = body.startingPriceCents === '' || body.startingPriceCents == null ? null : Number(body.startingPriceCents);
    const publicEmail = normalizeEmail(body.publicEmail), publicPhone = cleanText(body.publicPhone, 30);
    const instagram = cleanText(body.instagram, 30).replace(/^@/, ''), submittedWebsite = cleanText(body.website, 300);
    const website = normalizeWebsite(submittedWebsite), showEmail = body.showEmail === true && Boolean(publicEmail), showPhone = body.showPhone === true && Boolean(publicPhone), isPublished = body.isPublished === true;
    const invalidDraft = (state && !/^[A-Z]{2}$/.test(state)) || (serviceRadiusKm !== null && (!Number.isInteger(serviceRadiusKm) || serviceRadiusKm < 0 || serviceRadiusKm > 1000)) || (startingPriceCents !== null && (!Number.isInteger(startingPriceCents) || startingPriceCents < 0 || startingPriceCents > 100_000_000)) || (publicEmail && !isValidEmail(publicEmail)) || (publicPhone && publicPhone.length < 8) || (instagram && !/^[A-Za-z0-9._]{1,30}$/.test(instagram)) || (submittedWebsite && !website);
    if (invalidDraft) return json(400, { error: 'Revise os dados profissionais informados.' });
    const hasPublicContact = showEmail || showPhone || Boolean(instagram) || Boolean(website);
    const publishable = bio.length >= 60 && specialties.length > 0 && city.length >= 2 && /^[A-Z]{2}$/.test(state) && Boolean(current.profile_pic_key) && hasPublicContact;
    if (isPublished && !publishable) return json(400, { error: 'Para publicar, adicione foto, apresentacao, especialidade, localizacao e ao menos um contato profissional.' });
    const existing = await env.DB.prepare('SELECT slug FROM professional_profiles WHERE user_id = ?').bind(current.id).first();
    const slug = existing?.slug || `${slugify(current.name)}-${current.id}`;
    await env.DB.prepare(`INSERT INTO professional_profiles (user_id, slug, bio, specialties, city, state, service_radius_km, starting_price_cents, availability, public_email, public_phone, instagram, website, show_email, show_phone, is_published) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET bio = excluded.bio, specialties = excluded.specialties, city = excluded.city, state = excluded.state, service_radius_km = excluded.service_radius_km, starting_price_cents = excluded.starting_price_cents, availability = excluded.availability, public_email = excluded.public_email, public_phone = excluded.public_phone, instagram = excluded.instagram, website = excluded.website, show_email = excluded.show_email, show_phone = excluded.show_phone, is_published = excluded.is_published, updated_at = CURRENT_TIMESTAMP`).bind(current.id, slug, bio, JSON.stringify(specialties), city, state, serviceRadiusKm, startingPriceCents, availability, publicEmail, publicPhone, instagram, website, Number(showEmail), Number(showPhone), Number(isPublished)).run();
    const profile = await env.DB.prepare('SELECT * FROM professional_profiles WHERE user_id = ?').bind(current.id).first();
    return json(200, { profile: professionalProfile(profile, true), message: isPublished ? 'Perfil profissional publicado.' : 'Perfil profissional salvo.' });
  }

  async function reviewRequestsList({ request, env }) {
    const current = await authenticatedUser(request, env);
    if (!current) return json(401, { error: 'Faca login novamente.' });
    const query = current.role === 'photographer' ? `SELECT q.*, u.name AS client_name, r.id AS review_id, r.rating AS review_rating, r.comment AS review_comment, r.status AS review_status FROM review_requests q JOIN users u ON u.id = q.client_user_id LEFT JOIN reviews r ON r.request_id = q.id WHERE q.photographer_user_id = ? ORDER BY q.created_at DESC, q.id DESC` : `SELECT q.*, u.name AS photographer_name, p.slug AS photographer_slug, r.id AS review_id, r.rating AS review_rating, r.comment AS review_comment, r.status AS review_status FROM review_requests q JOIN users u ON u.id = q.photographer_user_id JOIN professional_profiles p ON p.user_id = q.photographer_user_id LEFT JOIN reviews r ON r.request_id = q.id WHERE q.client_user_id = ? ORDER BY q.created_at DESC, q.id DESC`;
    const result = await env.DB.prepare(query).bind(current.id).all();
    return json(200, { role: current.role, requests: result.results.map((row) => accountReviewRequest(row, current.role)) });
  }

  async function reviewRequestUpdate({ params, request, env, pathname }) {
    if (await isRateLimited(request, env, pathname, 20, 60 * 60 * 1000, env.ACCOUNT_RATE_LIMITER)) return json(429, { error: 'Muitas alteracoes. Aguarde antes de tentar novamente.' });
    const [requestId] = params;
    const current = await authenticatedUser(request, env);
    if (!current) return json(401, { error: 'Faca login novamente.' });
    if (current.role !== 'photographer') return json(403, { error: 'Somente o fotografo pode confirmar este contato.' });
    const body = await readJson(request);
    const status = ['confirmed', 'rejected'].includes(body.status) ? body.status : '';
    if (!status) return json(400, { error: 'Escolha confirmar ou rejeitar a solicitacao.' });
    const existing = await env.DB.prepare("SELECT id FROM review_requests WHERE id = ? AND photographer_user_id = ? AND status = 'pending'").bind(Number(requestId), current.id).first();
    if (!existing) return json(404, { error: 'Solicitacao pendente nao encontrada.' });
    await env.DB.prepare("UPDATE review_requests SET status = ?, confirmed_at = CASE WHEN ? = 'confirmed' THEN CURRENT_TIMESTAMP ELSE NULL END, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND photographer_user_id = ?").bind(status, status, Number(requestId), current.id).run();
    return json(200, { message: status === 'confirmed' ? 'Contato confirmado. O cliente ja pode avaliar.' : 'Solicitacao rejeitada.' });
  }

  async function reviewCreate({ params, request, env, pathname }) {
    if (await isRateLimited(request, env, pathname, 8, 60 * 60 * 1000, env.CONTENT_RATE_LIMITER)) return json(429, { error: 'Muitas avaliacoes. Aguarde antes de tentar novamente.' });
    const [requestId] = params, current = await authenticatedUser(request, env);
    if (!current) return json(401, { error: 'Faca login novamente.' });
    if (current.role !== 'client') return json(403, { error: 'Somente clientes podem avaliar fotografos.' });
    const eligibility = await env.DB.prepare('SELECT q.photographer_user_id, r.id AS review_id FROM review_requests q LEFT JOIN reviews r ON r.request_id = q.id WHERE q.id = ? AND q.client_user_id = ? AND q.status = \'confirmed\'').bind(Number(requestId), current.id).first();
    if (!eligibility) return json(403, { error: 'Este contato ainda nao esta confirmado para avaliacao.' });
    if (eligibility.review_id) return json(409, { error: 'Este contato ja possui uma avaliacao.' });
    const body = await readJson(request), rating = Number(body.rating), comment = cleanText(body.comment, 1000);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5 || comment.length < 10) return json(400, { error: 'Informe uma nota de 1 a 5 e um comentario com pelo menos 10 caracteres.' });
    const [inserted] = await env.DB.batch([
      env.DB.prepare('INSERT INTO reviews (request_id, client_user_id, photographer_user_id, rating, comment) VALUES (?, ?, ?, ?, ?)').bind(Number(requestId), current.id, eligibility.photographer_user_id, rating, comment),
      env.DB.prepare("INSERT INTO review_audit (review_id, actor_user_id, action, rating, comment) SELECT id, ?, 'created', ?, ? FROM reviews WHERE request_id = ?").bind(current.id, rating, comment, Number(requestId))
    ]);
    return json(201, { review: { id: Number(inserted.meta.last_row_id), rating, comment, status: 'active' }, message: 'Avaliacao publicada.' });
  }

  return { list, detail, photo, portfolioImage, reviews, reviewRequestCreate, conversationCreate, professionalProfileRead, professionalProfileUpdate, reviewRequestsList, reviewRequestUpdate, reviewCreate };
}

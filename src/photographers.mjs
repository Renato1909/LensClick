export function createPhotographerHandlers({
  json,
  cleanText,
  professionalProfile,
  portfolioItem,
  professionalSpecialties
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
  return { list, detail };
}

const PAYMENT_METHODS = new Set(['cash', 'pix', 'credit_card', 'debit_card']);
const STATES = new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));
const REFERENCE = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const TIME = /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/;
const MAX_PRICE = 100_000_000;
const Transitions = {
  accept: { role: 'photographer', from: ['pending'], to: 'accepted' },
  decline: { role: 'photographer', from: ['pending'], to: 'declined' },
  deliver: { role: 'photographer', from: ['accepted'], to: 'delivered' },
  complete: { role: 'client', from: ['delivered'], to: 'completed' },
  cancel: { role: 'client', from: ['pending', 'accepted'], to: 'cancelled' }
};

function timeInBrazil() {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

function isoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function engagement(row) {
  return {
    id: Number(row.id), slug: row.slug || '', clientName: row.client_name,
    photographerName: row.photographer_name, proposalId: row.proposal_id,
    category: row.service_category, description: row.service_description, eventType: row.event_type,
    eventDate: row.event_date, start: row.starts_at, end: row.ends_at, venue: row.venue,
    address: row.address, city: row.city, state: row.state, venueDetails: row.venue_details, notes: row.notes,
    priceCents: Number(row.price_cents), feeCents: Number(row.fee_cents), currency: 'BRL',
    paymentMethod: row.payment_method, paymentStatus: row.payment_status, status: row.status,
    reviewPublished: Boolean(row.has_review), createdAt: row.created_at, updatedAt: row.updated_at
  };
}

const Select = `
  SELECT e.*, client.name AS client_name, photographer.name AS photographer_name, p.slug,
    EXISTS(SELECT 1 FROM review_requests q JOIN reviews r ON r.request_id = q.id WHERE q.engagement_id = e.id) AS has_review
  FROM engagements e
  JOIN users client ON client.id = e.client_user_id
  JOIN users photographer ON photographer.id = e.photographer_user_id
  LEFT JOIN professional_profiles p ON p.user_id = e.photographer_user_id`;

export function createEngagementHandlers({ json, cleanText, authenticatedUser, readJson, isRateLimited, sha256 }) {
  const fail = (status, code) => json(status, { error: code, code });
  const isParticipant = (row, id) => Number(row.client_user_id) === id || Number(row.photographer_user_id) === id;
  const detailRow = (env, id) => env.DB.prepare(Select + ' WHERE e.id = ?').bind(id).first();

  async function create({ request, env, params, pathname }) {
    const client = await authenticatedUser(request, env);
    if (!client) return fail(401, 'unauthenticated');
    if (client.role !== 'client') return fail(403, 'forbidden_role');
    if (await isRateLimited(request, env, pathname, 12, 60 * 60 * 1000, env.CONTENT_RATE_LIMITER)) return fail(429, 'rate_limited');
    const [slug] = params;
    const body = await readJson(request);
    const reference = String(body.reference ?? '').toLowerCase();
    const eventDate = String(body.eventDate ?? '');
    const start = String(body.start ?? ''), end = String(body.end ?? '');
    const state = cleanText(body.state, 2).toUpperCase();
    const eventType = cleanText(body.eventType, 80);
    const description = cleanText(body.description, 1000);
    const venue = cleanText(body.venue, 160), address = cleanText(body.address, 220), city = cleanText(body.city, 80);
    const venueDetails = cleanText(body.venueDetails, 1000), notes = cleanText(body.notes, 1000);
    const category = cleanText(body.category, 30);
    const method = String(body.paymentMethod ?? '');
    const price = body.priceCents;
    const proposalId = body.proposalId ?? null;
    if (!REFERENCE.test(reference) || !isoDate(eventDate) || !TIME.test(start) || !TIME.test(end) ||
        start >= end || eventType.length < 2 || description.length < 10 || venue.length < 2 ||
        address.length < 5 || city.length < 2 || !STATES.has(state) || !PAYMENT_METHODS.has(method) ||
        !Number.isSafeInteger(price) || price < 0 || price > MAX_PRICE ||
        (proposalId !== null && (!Number.isSafeInteger(proposalId) || proposalId < 1))) {
      return fail(400, 'invalid_engagement');
    }
    const payload = { slug, eventDate, start, end, state, eventType, description, venue, address,
      city, venueDetails, notes, category, method, price, proposalId };
    const fingerprint = await sha256(JSON.stringify(payload));
    const replay = async () => {
      const existing = await env.DB.prepare(Select + ' WHERE e.client_user_id = ? AND e.client_reference = ?')
        .bind(client.id, reference).first();
      if (!existing) return null;
      return existing.request_hash === fingerprint
        ? json(200, { engagement: engagement(existing) })
        : fail(409, 'reference_reused');
    };
    const previous = await replay();
    if (previous) return previous;
    if (eventDate + 'T' + start < timeInBrazil()) return fail(400, 'invalid_engagement_date');

    const pro = await env.DB.prepare(`
      SELECT p.user_id, p.specialties, p.starting_price_cents
      FROM professional_profiles p JOIN users u ON u.id = p.user_id
      WHERE p.slug = ? AND u.role = 'photographer' AND (p.is_published = 1 OR ? IS NOT NULL)`)
      .bind(slug, proposalId).first();
    if (!pro) return fail(404, 'photographer_not_found');
    if (Number(pro.user_id) === Number(client.id)) return fail(403, 'forbidden_role');
    const specialties = JSON.parse(pro.specialties || '[]');
    if (!Array.isArray(specialties) || !specialties.includes(category)) return fail(400, 'invalid_service');

    if (proposalId !== null) {
      const proposal = await env.DB.prepare(`
        SELECT p.price_cents FROM proposals p JOIN budget_requests b ON b.id = p.request_id
        WHERE p.id = ? AND p.status = 'accepted' AND b.status = 'accepted'
          AND b.client_user_id = ? AND b.photographer_user_id = ? AND b.event_date = ?`)
        .bind(proposalId, client.id, pro.user_id, eventDate).first();
      if (!proposal) return fail(409, 'invalid_proposal');
      if (Number(proposal.price_cents) !== price) return fail(409, 'price_changed');
    } else if (pro.starting_price_cents == null || Number(pro.starting_price_cents) !== price) {
      return fail(409, 'price_changed');
    }

    const result = await env.DB.prepare(`
      INSERT INTO engagements
        (client_user_id, photographer_user_id, proposal_id, client_reference, request_hash,
          service_category, service_description, event_type, event_date, starts_at, ends_at, venue,
          address, city, state, venue_details, notes, price_cents, payment_method, payment_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING
      RETURNING id`).bind(client.id, pro.user_id, proposalId, reference, fingerprint, category, description,
      eventType, eventDate, start, end, venue, address, city, state, venueDetails, notes, price, method,
      method === 'cash' ? 'awaiting_cash' : 'gateway_required').first();
    if (!result) return (await replay()) || fail(409, 'duplicate_engagement');
    return json(201, { engagement: engagement(await detailRow(env, result.id)) });
  }

  async function list({ request, env }) {
    const current = await authenticatedUser(request, env);
    if (!current) return fail(401, 'unauthenticated');
    const rows = await env.DB.prepare(Select + ' WHERE e.client_user_id = ? OR e.photographer_user_id = ? ORDER BY e.id DESC')
      .bind(current.id, current.id).all();
    return json(200, { engagements: rows.results.map(engagement) });
  }

  async function detail({ request, env, params }) {
    const current = await authenticatedUser(request, env);
    if (!current) return fail(401, 'unauthenticated');
    const row = await detailRow(env, Number(params[0]));
    if (!row || !isParticipant(row, Number(current.id))) return fail(404, 'engagement_not_found');
    const events = await env.DB.prepare('SELECT status, payment_status, created_at FROM engagement_events WHERE engagement_id = ? ORDER BY id')
      .bind(row.id).all();
    return json(200, { engagement: engagement(row), history: events.results.map(e => ({
      status: e.status, paymentStatus: e.payment_status, createdAt: e.created_at
    })) });
  }

  async function update({ request, env, params }) {
    const current = await authenticatedUser(request, env);
    if (!current) return fail(401, 'unauthenticated');
    const row = await detailRow(env, Number(params[0]));
    if (!row || !isParticipant(row, Number(current.id))) return fail(404, 'engagement_not_found');
    const action = String((await readJson(request)).action ?? '');
    const transition = Object.hasOwn(Transitions, action) ? Transitions[action] : null;
    const participantRole = Number(row.client_user_id) === Number(current.id) ? 'client' : 'photographer';
    let result;
    if (action === 'receive_cash') {
      if (participantRole !== 'photographer') return fail(403, 'forbidden_role');
      result = await env.DB.prepare(`
        UPDATE engagements SET payment_status = 'cash_received', updated_at = CURRENT_TIMESTAMP, updated_by_user_id = ?
        WHERE id = ? AND payment_status = 'awaiting_cash' AND status IN ('accepted','delivered','completed')
        RETURNING id`).bind(current.id, row.id).first();
    } else if (transition) {
      if (participantRole !== transition.role) return fail(403, 'forbidden_role');
      if (action === 'deliver' && row.event_date + 'T' + row.ends_at > timeInBrazil()) {
        return fail(409, 'event_not_finished');
      }
      const extraCondition = {
        cancel: "AND payment_status <> 'cash_received'",
        accept: `AND NOT EXISTS (
          SELECT 1 FROM engagements other
          WHERE other.id <> engagements.id AND other.photographer_user_id = engagements.photographer_user_id
            AND other.event_date = engagements.event_date AND other.starts_at < engagements.ends_at
            AND engagements.starts_at < other.ends_at AND other.status IN ('accepted', 'delivered', 'completed')
        )`
      }[action] || '';
      result = await env.DB.prepare(`
        UPDATE engagements SET status = ?, updated_at = CURRENT_TIMESTAMP, updated_by_user_id = ?
        WHERE id = ? AND status IN (${transition.from.map(() => '?').join(', ')}) ${extraCondition}
        RETURNING id`).bind(transition.to, current.id, row.id, ...transition.from).first();
    } else return fail(400, 'invalid_action');
    if (!result) return fail(409, 'invalid_state');
    return json(200, { engagement: engagement(await detailRow(env, row.id)) });
  }

  async function review({ request, env, params, pathname }) {
    const current = await authenticatedUser(request, env);
    if (!current) return fail(401, 'unauthenticated');
    if (current.role !== 'client') return fail(403, 'forbidden_role');
    if (await isRateLimited(request, env, pathname, 8, 60 * 60 * 1000, env.CONTENT_RATE_LIMITER)) return fail(429, 'rate_limited');
    const id = Number(params[0]);
    const row = await detailRow(env, id);
    if (!row || Number(row.client_user_id) !== Number(current.id)) return fail(404, 'engagement_not_found');
    if (row.status !== 'completed') return fail(409, 'engagement_not_completed');
    const body = await readJson(request);
    const comment = cleanText(body.comment, 1000);
    if (!Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5 || comment.length < 10) {
      return fail(400, 'invalid_review');
    }
    const [, inserted] = await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO review_requests (client_user_id, photographer_user_id, message, status, confirmed_at, engagement_id)
        SELECT client_user_id, photographer_user_id, 'Contratacao concluida.', 'confirmed', CURRENT_TIMESTAMP, id
        FROM engagements WHERE id = ? AND client_user_id = ? AND status = 'completed'
        ON CONFLICT(engagement_id) DO NOTHING`).bind(id, current.id),
      env.DB.prepare(`
        INSERT INTO reviews (request_id, client_user_id, photographer_user_id, rating, comment)
        SELECT id, client_user_id, photographer_user_id, ?, ? FROM review_requests WHERE engagement_id = ?
        ON CONFLICT(request_id) DO NOTHING`).bind(body.rating, comment, id),
      env.DB.prepare(`
        INSERT INTO review_audit (review_id, actor_user_id, action, rating, comment)
        SELECT r.id, r.client_user_id, 'created', r.rating, r.comment FROM reviews r
        JOIN review_requests q ON q.id = r.request_id WHERE q.engagement_id = ? AND changes() = 1`).bind(id)
    ]);
    return Number(inserted.meta.changes) === 1 ? json(201, { ok: true }) : fail(409, 'duplicate_review');
  }

  return { create, list, detail, update, review };
}

const MAX_PORTFOLIO_IMAGE_BYTES = 4_000_000;
const MAX_PORTFOLIO_ITEMS = 12;

export function createPortfolioHandlers({ json, cleanText, authenticatedUser, isRateLimited, readJson, portfolioItem, storedImageResponse }) {
  async function responsiveImage(object, request, env) {
    const width = Number(new URL(request.url).searchParams.get('width'));
    if (!object || !env.IMAGES || ![320, 640, 1280].includes(width)) return storedImageResponse(object, request, 'private, max-age=300, must-revalidate');
    const transformed = (await env.IMAGES.input(object.body).transform({ width }).output({ format: 'image/webp', quality: 82 })).response();
    const headers = new Headers(transformed.headers);
    headers.set('Cache-Control', 'private, max-age=300, must-revalidate');
    return new Response(transformed.body, { status: transformed.status, headers });
  }
  async function upload(request) {
    const contentType = String(request.headers.get('Content-Type') || '').toLowerCase();
    if (!contentType.startsWith('multipart/form-data')) throw Object.assign(new Error('Envie a imagem como formulario.'), { status: 415 });
    const declaredSize = Number(request.headers.get('Content-Length') || 0);
    if (declaredSize > MAX_PORTFOLIO_IMAGE_BYTES + 100_000) throw Object.assign(new Error('A imagem deve ter no maximo 4 MB.'), { status: 413 });
    const form = await request.formData();
    const file = form.get('image');
    const altText = cleanText(form.get('altText'), 160);
    const caption = cleanText(form.get('caption'), 240);
    if (!(file instanceof File) || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw Object.assign(new Error('Escolha uma imagem JPG, PNG ou WebP.'), { status: 400 });
    if (file.size < 1 || file.size > MAX_PORTFOLIO_IMAGE_BYTES) throw Object.assign(new Error('A imagem deve ter no maximo 4 MB.'), { status: 413 });
    if (altText.length < 3) throw Object.assign(new Error('Descreva a imagem para acessibilidade.'), { status: 400 });
    const extension = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1];
    return { bytes: await file.arrayBuffer(), contentType: file.type, extension, altText, caption };
  }

  async function create({ request, env, pathname }) {
    if (await isRateLimited(request, env, pathname, 20, 60 * 60 * 1000, env.CONTENT_RATE_LIMITER)) return json(429, { error: 'Muitos envios. Aguarde antes de tentar novamente.' });
    const current = await authenticatedUser(request, env);
    if (!current) return json(401, { error: 'Faca login novamente.' });
    if (current.role !== 'photographer') return json(403, { error: 'Somente perfis de fotografo podem criar portfolio.' });
    const count = Number(await env.DB.prepare('SELECT COUNT(*) AS total FROM portfolio_items WHERE user_id = ?').bind(current.id).first('total'));
    if (count >= MAX_PORTFOLIO_ITEMS) return json(409, { error: 'Seu portfolio ja possui o limite de 12 imagens.' });
    const itemUpload = await upload(request);
    const objectKey = `portfolio/${current.id}/${crypto.randomUUID()}.${itemUpload.extension}`;
    await env.PROFILE_IMAGES.put(objectKey, itemUpload.bytes, { httpMetadata: { contentType: itemUpload.contentType } });
    try {
      const result = await env.DB.prepare('INSERT INTO portfolio_items (user_id, object_key, caption, alt_text, position) VALUES (?, ?, ?, ?, ?)').bind(current.id, objectKey, itemUpload.caption, itemUpload.altText, count).run();
      const item = await env.DB.prepare('SELECT id, caption, alt_text, position, updated_at FROM portfolio_items WHERE id = ? AND user_id = ?').bind(Number(result.meta.last_row_id), current.id).first();
      return json(201, { item: portfolioItem(item), message: 'Imagem adicionada ao portfolio.' });
    } catch (error) {
      await env.PROFILE_IMAGES.delete(objectKey);
      throw error;
    }
  }

  async function update({ request, env }) {
    const current = await authenticatedUser(request, env);
    if (!current) return json(401, { error: 'Faca login novamente.' });
    const body = await readJson(request);
    if (!Array.isArray(body.items) || body.items.length > MAX_PORTFOLIO_ITEMS) return json(400, { error: 'Organizacao do portfolio invalida.' });
    const ids = body.items.map((item) => Number(item.id));
    if (ids.some((id) => !Number.isInteger(id) || id < 1) || new Set(ids).size !== ids.length) return json(400, { error: 'Organizacao do portfolio invalida.' });
    if (ids.length) {
      const owned = await env.DB.prepare(`SELECT id FROM portfolio_items WHERE user_id = ? AND id IN (${ids.map(() => '?').join(',')})`).bind(current.id, ...ids).all();
      if (owned.results.length !== ids.length) return json(403, { error: 'Item de portfolio nao autorizado.' });
    }
    const statements = body.items.map((item, position) => {
      const altText = cleanText(item.altText, 160);
      if (altText.length < 3) throw Object.assign(new Error('Descreva todas as imagens para acessibilidade.'), { status: 400 });
      return env.DB.prepare('UPDATE portfolio_items SET caption = ?, alt_text = ?, position = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?').bind(cleanText(item.caption, 240), altText, position, Number(item.id), current.id);
    });
    if (statements.length) await env.DB.batch(statements);
    const portfolio = await env.DB.prepare('SELECT id, caption, alt_text, position, updated_at FROM portfolio_items WHERE user_id = ? ORDER BY position, id').bind(current.id).all();
    return json(200, { portfolio: portfolio.results.map((item) => portfolioItem(item)), message: 'Portfolio atualizado.' });
  }

  async function image({ params, request, env }) {
    const [itemId] = params;
    const current = await authenticatedUser(request, env);
    if (!current) return json(401, { error: 'Faca login novamente.' });
    const item = await env.DB.prepare('SELECT object_key FROM portfolio_items WHERE id = ? AND user_id = ?').bind(Number(itemId), current.id).first();
    if (!item) return json(404, { error: 'Imagem nao encontrada.' });
    return responsiveImage(await env.PROFILE_IMAGES.get(item.object_key), request, env);
  }

  async function remove({ params, request, env }) {
    const [portfolioItemId] = params;
    const current = await authenticatedUser(request, env);
    if (!current) return json(401, { error: 'Faca login novamente.' });
    const itemId = Number(portfolioItemId);
    const item = await env.DB.prepare('SELECT object_key FROM portfolio_items WHERE id = ? AND user_id = ?').bind(itemId, current.id).first();
    if (!item) return json(404, { error: 'Imagem nao encontrada.' });
    await env.PROFILE_IMAGES.delete(item.object_key);
    await env.DB.prepare('DELETE FROM portfolio_items WHERE id = ? AND user_id = ?').bind(itemId, current.id).run();
    return json(200, { message: 'Imagem removida permanentemente.' });
  }

  return { create, update, image, remove };
}

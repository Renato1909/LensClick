export function createAccountSecurityHandlers({ json, cleanText, normalizeEmail, isValidEmail, authenticatedUser, readJson, verifyPassword, decodeProfilePicture, isValidPassword, hashPassword, publicUser, responsiveImage, sessionCookie, isRateLimited, reportOperationalError, sensitiveRateLimit, authRateLimit }) {
  const PRIVATE_IMAGE_CACHE = { storedCacheControl: 'private, max-age=300, must-revalidate', transformedCacheControl: 'private, max-age=300, must-revalidate' };
  async function profileUpdate({ request, env, requestContext }) {
    const current = await authenticatedUser(request, env); if (!current) return json(401, { error: 'Faca login novamente.' });
    const body = await readJson(request), name = cleanText(body.name, 100), email = normalizeEmail(body.email), phone = cleanText(body.phone, 30);
    const role = ['client', 'photographer'].includes(body.role) ? body.role : 'client', gender = ['male', 'female', 'other'].includes(body.gender) ? body.gender : 'other';
    const age = body.age === '' || body.age == null ? null : Number(body.age);
    if (name.length < 2 || !isValidEmail(email) || phone.length < 8 || (age !== null && (!Number.isInteger(age) || age < 0 || age > 120))) return json(400, { error: 'Revise os dados informados.' });
    const emailChanged = email !== normalizeEmail(current.email);
    if (emailChanged && !(await verifyPassword(String(body.currentPassword || ''), current.password_hash))) return json(403, { error: 'Informe sua senha atual para alterar o e-mail.' });
    if (await env.DB.prepare('SELECT id FROM users WHERE email = ? AND id <> ?').bind(email, current.id).first()) return json(409, { error: 'Este e-mail ja pertence a outra conta.' });
    const submittedPicture = String(body.profilePic || ''), keepsCurrentPicture = submittedPicture.startsWith(`/api/profile-picture/${current.id}`);
    let nextPictureKey = current.profile_pic_key || null, newPictureKey = null;
    if (!submittedPicture) nextPictureKey = null;
    else if (!keepsCurrentPicture) { const picture = decodeProfilePicture(submittedPicture); newPictureKey = `profiles/${current.id}/${crypto.randomUUID()}.${picture.extension}`; await env.PROFILE_IMAGES.put(newPictureKey, picture.bytes, { httpMetadata: { contentType: picture.contentType } }); nextPictureKey = newPictureKey; }
    try {
      const statements = [env.DB.prepare('UPDATE users SET name = ?, email = ?, phone = ?, role = ?, age = ?, gender = ?, profile_pic_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(name, email, phone, role, age, gender, nextPictureKey, current.id)];
      if (emailChanged) { statements.push(env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?').bind(current.id, current.authenticated_session_hash), env.DB.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').bind(current.id)); }
      if (role !== 'photographer' || !nextPictureKey) statements.push(env.DB.prepare('UPDATE professional_profiles SET is_published = 0, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?').bind(current.id));
      await env.DB.batch(statements);
    } catch (error) { if (newPictureKey) await env.PROFILE_IMAGES.delete(newPictureKey); if (String(error?.message).toUpperCase().includes('UNIQUE')) return json(409, { error: 'Este e-mail ja pertence a outra conta.' }); throw error; }
    if (current.profile_pic_key && current.profile_pic_key !== nextPictureKey) try { await env.PROFILE_IMAGES.delete(current.profile_pic_key); } catch { reportOperationalError(requestContext, 'storage.profile_picture.cleanup_failed', 'storage_error'); }
    return json(200, { user: publicUser(await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(current.id).first()) });
  }
  async function passwordUpdate({ request, env, pathname }) {
    if (await isRateLimited(request, env, pathname, authRateLimit[0], authRateLimit[1], env.AUTH_RATE_LIMITER)) return json(429, { error: 'Muitas tentativas. Aguarde alguns minutos.' });
    const current = await authenticatedUser(request, env); if (!current) return json(401, { error: 'Faca login novamente.' }); const body = await readJson(request), currentPassword = String(body.currentPassword || ''), newPassword = String(body.newPassword || '');
    if (!(await verifyPassword(currentPassword, current.password_hash))) return json(403, { error: 'A senha atual esta incorreta.' });
    if (!isValidPassword(newPassword)) return json(400, { error: 'A nova senha deve ter ao menos 8 caracteres, uma letra e um numero.' });
    if (await verifyPassword(newPassword, current.password_hash)) return json(409, { error: 'A nova senha precisa ser diferente da senha atual.' });
    await env.DB.batch([env.DB.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(await hashPassword(newPassword), current.id), env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?').bind(current.id, current.authenticated_session_hash), env.DB.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').bind(current.id)]);
    return json(200, { message: 'Senha alterada com sucesso. As outras sessoes foram encerradas.' });
  }
  async function photoDelete({ request, env }) { const current = await authenticatedUser(request, env); if (!current) return json(401, { error: 'Faca login novamente.' }); if (current.profile_pic_key) await env.PROFILE_IMAGES.delete(current.profile_pic_key); await env.DB.batch([env.DB.prepare('UPDATE users SET profile_pic_key = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(current.id), env.DB.prepare('UPDATE professional_profiles SET is_published = 0, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?').bind(current.id)]); return json(200, { user: publicUser(await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(current.id).first()), message: 'Foto removida com sucesso.' }); }
  async function accountDelete({ request, env, pathname }) {
    if (await isRateLimited(request, env, pathname, sensitiveRateLimit[0], sensitiveRateLimit[1], env.SENSITIVE_RATE_LIMITER)) return json(429, { error: 'Muitas tentativas. Aguarde alguns minutos.' });
    const current = await authenticatedUser(request, env); if (!current) return json(401, { error: 'Faca login novamente.' }); const body = await readJson(request), confirmation = cleanText(body.confirmation, 20).toUpperCase();
    if (!['EXCLUIR', 'DELETE'].includes(confirmation)) return json(400, { error: 'Digite a frase de confirmacao exatamente como solicitado.' });
    if (!(await verifyPassword(String(body.currentPassword || ''), current.password_hash))) return json(403, { error: 'A senha atual esta incorreta.' });
    const portfolioObjects = await env.DB.prepare('SELECT object_key FROM portfolio_items WHERE user_id = ?').bind(current.id).all(), keys = [current.profile_pic_key, ...portfolioObjects.results.map((item) => item.object_key)].filter(Boolean);
    if (keys.length) await env.PROFILE_IMAGES.delete(keys);
    await env.DB.batch([env.DB.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').bind(current.id), env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(current.id), env.DB.prepare('DELETE FROM users WHERE id = ?').bind(current.id)]);
    const headers = current.authenticated_via === 'mobile' ? {} : { 'Set-Cookie': sessionCookie('', request, 0) };
    return json(200, { message: 'Conta e dados controlados por ela excluidos permanentemente.' }, headers);
  }
  async function profilePicture({ params, request, env }) { const [userId] = params, current = await authenticatedUser(request, env); if (!current || Number(userId) !== Number(current.id) || !current.profile_pic_key) return json(404, { error: 'Imagem nao encontrada.' }); return responsiveImage(await env.PROFILE_IMAGES.get(current.profile_pic_key), request, env, PRIVATE_IMAGE_CACHE); }
  return { profileUpdate, passwordUpdate, photoDelete, accountDelete, profilePicture };
}

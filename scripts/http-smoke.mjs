const base = process.argv[2] || process.env.LENSCLICK_SMOKE_URL || 'http://127.0.0.1:4174';
let cookie = '';

async function call(path, method = 'GET', body) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json', Origin: base } : {}),
      ...(cookie ? { Cookie: cookie } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const type = response.headers.get('content-type') || '';
  const responseText = await response.text();
  let data = null;
  if (type.includes('json')) {
    try { data = JSON.parse(responseText); } catch { data = null; }
  }
  if (!response.ok && !data) data = { error: responseText.slice(0, 300) || 'sem detalhes' };
  return { response, data };
}

function expectStatus(result, expected, label) {
  if (result.response.status !== expected) {
    throw new Error(`${label}: esperado ${expected}, recebido ${result.response.status} (${result.data?.error || 'sem detalhes'})`);
  }
  console.log(`OK ${result.response.status} - ${label}`);
}

const email = `worker-${Date.now()}@example.com`;
expectStatus(await call('/'), 200, 'assets estaticos');
expectStatus(await call('/api/auth/register', 'POST', {
  name: 'Teste Cloudflare', email, phone: '11999999999', password: 'Segura123'
}), 201, 'cadastro no D1');

const me = await call('/api/auth/me');
expectStatus(me, 200, 'sessao autenticada');

const onePixelPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const profile = await call('/api/profile', 'PUT', { ...me.data.user, profilePic: onePixelPng });
expectStatus(profile, 200, 'perfil salvo no D1 e foto no R2');
expectStatus(await call(profile.data.user.profilePic), 200, 'foto privada recuperada do R2');

expectStatus(await call('/api/contact', 'POST', {
  name: 'Teste Cloudflare', email, message: 'Mensagem de verificacao local.'
}), 201, 'contato no D1');
expectStatus(await call('/api/newsletter', 'POST', { email }), 201, 'newsletter no D1');
expectStatus(await call('/api/auth/logout', 'POST', {}), 200, 'logout');
expectStatus(await call('/api/auth/me'), 401, 'sessao encerrada');

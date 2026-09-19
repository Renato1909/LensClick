import { expect, test } from '@playwright/test';

const PASSWORD = 'Segura123';
const ONE_PIXEL_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function uniqueEmail(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

async function api(request, method, path, data) {
  const base = process.env.LENSCLICK_E2E_URL || 'http://127.0.0.1:4174';
  // O miniflare local pode devolver 200 vazio sob carga; uma nova tentativa
  // isolada evita falso negativo sem mascarar erros reais da API.
  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await request.fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json', Origin: base },
      data: data ? JSON.stringify(data) : undefined
    });
    const body = await response.json().catch(() => null);
    if (body !== null || method !== 'GET' || attempt === 2) {
      return { status: response.status(), body };
    }
  }
  throw new Error('unreachable');
}

// Marca checkboxes clicando no rótulo, como um usuário real: alguns
// invólucros cobrem o input e interceptam o clique direto (flake do CI).
async function checkViaLabel(page, inputSelector) {
  const input = page.locator(inputSelector);
  if (await input.isChecked()) return;
  await page.locator(`label:has(${inputSelector})`).first().click();
  await expect(input).toBeChecked({ timeout: 10_000 });
}

// Preenchimento determinístico: define o valor via JS, dispara input e
// comprova que grudou (com nova tentativa). O fill/type do Playwright falha
// em silêncio neste app quando o populate assíncrono ainda está em voo, e um
// populate tardio limpa o campo sem disparar eventos.
async function fillField(page, selector, text) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.evaluate(
      ([sel, value]) => {
        const el = document.querySelector(sel);
        el.focus();
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      },
      [selector, text]
    );
    try {
      await expect.poll(
        async () => page.evaluate((sel) => document.querySelector(sel).value, selector),
        { timeout: 3_000 }
      ).toBe(text);
      return;
    } catch (error) {
      if (attempt === 3) throw error;
    }
  }
}

// Avança no assistente com nova tentativa: em runners lentos a validação
// ou a renderização podem perder a primeira navegação.
async function goToStep(page, step) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.click(`button[data-onboarding-step="${step}"]`);
    try {
      await expect(page.locator(`[data-onboarding-panel="${step}"]`).first()).toBeVisible({ timeout: 10_000 });
      return;
    } catch (error) {
      if (attempt === 3) throw error;
    }
  }
}

test('cadastro cria a conta pelo navegador e entra no perfil', async ({ page }) => {
  const email = uniqueEmail('e2e-cadastro');
  await page.goto('/cadastro.html');
  await fillField(page, '#signupName', 'Conta Navegador');
  await fillField(page, '#signupEmail', email);
  await fillField(page, '#signupPhone', '(11) 99999-9999');
  await fillField(page, '#signupPassword', PASSWORD);
  await fillField(page, '#signupConfirmPassword', PASSWORD);
  await checkViaLabel(page, '#signupConsent');
  await page.click('#signupForm button[type="submit"]');
  await page.waitForURL('**/perfil*', { timeout: 15_000 });

  const me = await api(page.request, 'GET', '/api/auth/me');
  expect(me.status).toBe(200);
  expect(me.body.user.email).toBe(email);
});

test('publicacao do perfil profissional pelo navegador', async ({ page }) => {
  const email = uniqueEmail('e2e-foto');
  const registered = await api(page.request, 'POST', '/api/auth/register', {
    name: 'Foto Navegador', email, phone: '(11) 98888-8888', password: PASSWORD
  });
  expect(registered.status).toBe(201);

  await page.goto('/login.html');
  await page.fill('#loginEmail', email);
  await page.fill('#loginPassword', PASSWORD);
  // Sincroniza pelo /api/auth/me: o populate() do carregamento sobrescreve
  // papel e foto com os dados do servidor se interagirmos antes dele.
  await Promise.all([
    page.waitForURL('**/perfil*', { timeout: 15_000 }),
    page.waitForResponse(/\/api\/auth\/me/, { timeout: 20_000 }),
    page.click('#loginForm button[type="submit"]')
  ]);
  // O populate() roda após o corpo da resposta, não nos headers: espera o
  // campo de e-mail espelhar o servidor antes de tocar no formulário.
  await expect.poll(
    async () => page.evaluate(() => document.getElementById('profileEmail').value),
    { timeout: 20_000 }
  ).toBe(email);

  // Aguarda o carregamento inicial: interagir antes do populate() faz o
  // próprio carregamento sobrescrever papel e foto com os dados do servidor.
  await expect(page.locator('#profileForm')).not.toHaveAttribute('aria-busy', 'true', { timeout: 15_000 });
  await page.selectOption('#profileRole', 'photographer');
  await page.setInputFiles('#profilePic', {
    name: 'foto.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64'
    )
  });
  // O FileReader é assíncrono: sem esta espera o PUT sai sem a foto e a
  // publicação trava (foto é requisito do passo 1).
  await expect(page.locator('#profileImage')).toBeVisible({ timeout: 15_000 });
  await page.click('#saveProfile');
  await expect(page.locator('#profileMsg[data-type="success"]')).toBeVisible({ timeout: 15_000 });
  // Pina o contrato do salvamento: papel e foto precisam estar no servidor
  // antes de seguir para o assistente de publicação.
  const saved = await api(page.request, 'GET', '/api/auth/me');
  expect(saved.status).toBe(200);
  expect(saved.body.user.role).toBe('photographer');
  expect(saved.body.user.profilePic).not.toBe('');
  // Registra os observadores ANTES do reload: o populateProfessional tardio
  // limpa bio e especialidades com o rascunho do servidor.
  const meAfterReload = page.waitForResponse(/\/api\/auth\/me/, { timeout: 20_000 });
  const proAfterReload = page.waitForResponse(/\/api\/account\/professional-profile/, { timeout: 20_000 });
  await page.reload();
  await meAfterReload;
  await expect(page.locator('#professionalSection')).toBeVisible({ timeout: 20_000 });
  await proAfterReload;
  // O populateProfessional() roda após o corpo da resposta: o passo 1 com
  // aria-current prova que a cadeia de carregamento terminou.
  await expect(page.locator('button[data-onboarding-step="1"][aria-current="step"]')).toBeAttached({ timeout: 20_000 });

  await fillField(
    page,
    '#professionalBio',
    'Fotografo de casamentos e ensaios externos ha mais de dez anos, com olhar documental e entrega pontual.'
  );
  const weddingSpecialty = page.locator('input[name="specialties"][value="wedding"]');
  if (!(await weddingSpecialty.isChecked())) await checkViaLabel(page, 'input[name="specialties"][value="wedding"]');
  await goToStep(page, 2);
  await fillField(page, '#professionalCity', 'Sao Paulo');
  await fillField(page, '#professionalState', 'SP');
  await goToStep(page, 3);
  await fillField(page, '#professionalEmail', email);
  await checkViaLabel(page, '#professionalShowEmail');
  await goToStep(page, 4);
  await checkViaLabel(page, '#professionalPublished');
  await page.click('#saveProfessionalProfile');
  await expect(page.locator('#professionalMsg')).not.toBeHidden({ timeout: 15_000 });

  const profile = await api(page.request, 'GET', '/api/account/professional-profile');
  expect(profile.status).toBe(200);
  expect(profile.body.profile.isPublished).toBe(true);
});

test('cliente envia mensagem ao fotografo pelo navegador', async ({ page }) => {
  const photoEmail = uniqueEmail('e2e-msg-foto');
  const registered = await api(page.request, 'POST', '/api/auth/register', {
    name: 'Foto Mensagem', email: photoEmail, phone: '(11) 97777-7777', password: PASSWORD
  });
  expect(registered.status).toBe(201);
  await api(page.request, 'PUT', '/api/profile', {
    name: 'Foto Mensagem', email: photoEmail, phone: '(11) 97777-7777',
    role: 'photographer', profilePic: ONE_PIXEL_PNG
  });
  const published = await api(page.request, 'PUT', '/api/account/professional-profile', {
    bio: 'Ensaios externos e casamentos com entrega em alta resolucao e album impresso incluso no pacote.',
    specialties: ['wedding'],
    city: 'Campinas',
    state: 'SP',
    publicEmail: photoEmail,
    showEmail: true,
    isPublished: true
  });
  expect(published.status).toBe(200);
  const slug = published.body.profile.slug;
  expect(slug).toBeTruthy();

  const clientEmail = uniqueEmail('e2e-msg-cliente');
  await page.goto('/cadastro.html');
  await fillField(page, '#signupName', 'Cliente Mensagem');
  await fillField(page, '#signupEmail', clientEmail);
  await fillField(page, '#signupPhone', '(11) 96666-6666');
  await fillField(page, '#signupPassword', PASSWORD);
  await fillField(page, '#signupConfirmPassword', PASSWORD);
  await checkViaLabel(page, '#signupConsent');
  await page.click('#signupForm button[type="submit"]');
  await page.waitForURL('**/perfil*', { timeout: 15_000 });

  await page.goto(`/fotografo/${slug}`);
  await expect(page.locator('#conversationStartForm')).toBeVisible({ timeout: 15_000 });
  await fillField(page, '#conversationStartMessage', 'Ola! Quero um orcamento para meu casamento em junho.');
  await page.click('#conversationStartButton');
  await page.waitForURL('**/perfil?conversa=**', { timeout: 15_000 });

  const inbox = await api(page.request, 'GET', '/api/account/conversations');
  expect(inbox.status).toBe(200);
  expect(inbox.body.conversations.length).toBe(1);
});


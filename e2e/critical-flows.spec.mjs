import { expect, test } from '@playwright/test';

const PASSWORD = 'Segura123';
const ONE_PIXEL_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function uniqueEmail(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

async function api(request, method, path, data) {
  const base = process.env.LENSCLICK_E2E_URL || 'http://127.0.0.1:4174';
  const response = await request.fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', Origin: base },
    data: data ? JSON.stringify(data) : undefined
  });
  return { status: response.status(), body: await response.json().catch(() => null) };
}

// Marca checkboxes clicando no rótulo, como um usuário real: alguns
// invólucros cobrem o input e interceptam o clique direto (flake do CI).
async function checkViaLabel(page, inputSelector) {
  const input = page.locator(inputSelector);
  if (await input.isChecked()) return;
  await page.locator(`label:has(${inputSelector})`).first().click();
  await expect(input).toBeChecked({ timeout: 5_000 });
}

test('cadastro cria a conta pelo navegador e entra no perfil', async ({ page }) => {
  const email = uniqueEmail('e2e-cadastro');
  await page.goto('/cadastro.html');
  await page.fill('#signupName', 'Conta Navegador');
  await page.fill('#signupEmail', email);
  await page.fill('#signupPhone', '(11) 99999-9999');
  await page.fill('#signupPassword', PASSWORD);
  await page.fill('#signupConfirmPassword', PASSWORD);
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
  await page.click('#loginForm button[type="submit"]');
  await page.waitForURL('**/perfil*', { timeout: 15_000 });

  await page.selectOption('#profileRole', 'photographer');
  await page.setInputFiles('#profilePic', {
    name: 'foto.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64'
    )
  });
  await page.click('#saveProfile');
  await expect(page.locator('#profileMsg')).not.toBeHidden({ timeout: 15_000 });
  await page.reload();
  await expect(page.locator('#professionalForm')).not.toHaveAttribute('aria-busy', 'true', { timeout: 15_000 });
  // Em runners lentos a seção só aparece após o carregamento assíncrono do
  // perfil; sem esta espera o preenchimento estoura o timeout do teste.
  await expect(page.locator('#professionalSection')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#professionalBio')).toBeVisible({ timeout: 15_000 });

  await page.fill(
    '#professionalBio',
    'Fotografo de casamentos e ensaios externos ha mais de dez anos, com olhar documental e entrega pontual.'
  );
  const weddingSpecialty = page.locator('input[name="specialties"][value="wedding"]');
  if (!(await weddingSpecialty.isChecked())) await checkViaLabel(page, 'input[name="specialties"][value="wedding"]');
  await page.click('button[data-onboarding-step="2"]');
  await expect(page.locator('[data-onboarding-panel="2"]').first()).toBeVisible();
  await page.fill('#professionalCity', 'Sao Paulo');
  await page.fill('#professionalState', 'SP');
  await page.click('button[data-onboarding-step="3"]');
  await expect(page.locator('[data-onboarding-panel="3"]').first()).toBeVisible();
  await page.fill('#professionalEmail', email);
  await checkViaLabel(page, '#professionalShowEmail');
  await page.click('button[data-onboarding-step="4"]');
  await expect(page.locator('[data-onboarding-panel="4"]').first()).toBeVisible();
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
  await page.fill('#signupName', 'Cliente Mensagem');
  await page.fill('#signupEmail', clientEmail);
  await page.fill('#signupPhone', '(11) 96666-6666');
  await page.fill('#signupPassword', PASSWORD);
  await page.fill('#signupConfirmPassword', PASSWORD);
  await checkViaLabel(page, '#signupConsent');
  await page.click('#signupForm button[type="submit"]');
  await page.waitForURL('**/perfil*', { timeout: 15_000 });

  await page.goto(`/fotografo/${slug}`);
  await expect(page.locator('#conversationStartForm')).toBeVisible({ timeout: 15_000 });
  await page.fill('#conversationStartMessage', 'Ola! Quero um orcamento para meu casamento em junho.');
  await page.click('#conversationStartButton');
  await page.waitForURL('**/perfil?conversa=**', { timeout: 15_000 });

  const inbox = await api(page.request, 'GET', '/api/account/conversations');
  expect(inbox.status).toBe(200);
  expect(inbox.body.conversations.length).toBe(1);
});

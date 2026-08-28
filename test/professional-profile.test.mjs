import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { readCatalogs } from '../test-utils/i18n.mjs';

const read = (file) => readFileSync(resolve(file), 'utf8');

test('a migracao profissional possui privacidade, integridade e exclusao em cascata', () => {
  const database = new DatabaseSync(':memory:');
  database.exec(read('migrations/0001_initial.sql'));
  database.exec(read('migrations/0002_password_reset.sql'));
  database.exec(read('migrations/0003_professional_profiles.sql'));
  const table = database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'professional_profiles'").get();

  assert.match(table.sql, /user_id INTEGER PRIMARY KEY REFERENCES users\(id\) ON DELETE CASCADE/);
  assert.match(table.sql, /slug TEXT NOT NULL COLLATE NOCASE UNIQUE/);
  assert.match(table.sql, /show_email INTEGER NOT NULL DEFAULT 0/);
  assert.match(table.sql, /show_phone INTEGER NOT NULL DEFAULT 0/);
  assert.match(table.sql, /is_published INTEGER NOT NULL DEFAULT 0/);
  database.close();
});

test('a conta profissional oferece rascunho, publicacao e controles de contato', () => {
  const page = read('public/perfil.html');
  const script = read('public/profile-api.js');
  const styles = read('public/account.css');

  assert.match(page, /id="professionalSection"[^>]*hidden/);
  assert.match(page, /id="professionalForm"/);
  assert.match(page, /id="professionalPublished"/);
  assert.match(page, /id="professionalShowEmail"/);
  assert.match(page, /id="professionalShowPhone"/);
  assert.match(page, /name="specialties"/);
  assert.match(script, /\/api\/account\/professional-profile/);
  assert.match(script, /selectedCount > 6/);
  assert.match(styles, /\.publish-control/);
  assert.match(styles, /\.specialty-grid/);
});

test('o onboarding profissional guia, valida e preserva o rascunho no D1', () => {
  const page = read('public/perfil.html');
  const script = read('public/profile-api.js');
  const styles = read('public/account.css');

  assert.equal((page.match(/data-onboarding-step="[1-4]"/g) || []).length, 4);
  assert.equal((page.match(/data-onboarding-panel="[1-4]"/g) || []).length, 5);
  assert.match(page, /role="progressbar"[^>]*aria-valuenow="0"/);
  assert.match(page, /id="onboardingChecklist"/);
  assert.match(page, /id="onboardingBack"/);
  assert.match(page, /id="onboardingNext"/);
  assert.match(script, /function validateOnboardingStep/);
  assert.match(script, /function onboardingRequirements/);
  assert.match(script, /window\.sessionStorage\.setItem\(ONBOARDING_STEP_KEY, String\(step\)\)/);
  assert.doesNotMatch(script, /sessionStorage\.setItem\([^,]+,\s*JSON\.stringify/);
  assert.match(script, /method: 'PUT'/);
  assert.match(styles, /\.onboarding-progress/);
  assert.match(styles, /prefers-reduced-motion/);
});

test('o perfil publico renderiza dados seguros sem HTML fornecido pelo usuario', () => {
  const page = read('public/fotografo.html');
  const script = read('public/photographer-profile.js');
  const worker = read('src/worker.mjs');

  assert.match(page, /id="professionalProfile" hidden/);
  assert.match(page, /id="photographerContacts"/);
  assert.match(script, /textContent = profile\.bio/);
  assert.doesNotMatch(script, /innerHTML\s*=/);
  assert.match(script, /rel = 'noopener noreferrer'/);
  assert.match(worker, /p\.is_published = 1 AND u\.role = 'photographer'/);
  assert.match(worker, /contacts:[\s\S]*row\.show_email[\s\S]*row\.show_phone/);
  assert.match(worker, /hasPublicContact/);
  assert.match(worker, /UPDATE professional_profiles SET is_published = 0/);
});

test('a experiencia profissional e bilingue em edicao e visualizacao publica', () => {
  const accountPage = read('public/perfil.html');
  const publicPage = read('public/fotografo.html');
  const translations = readCatalogs();
  const keys = [...`${accountPage}\n${publicPage}`.matchAll(/data-i18n="([^"]+)"/g)].map((match) => match[1]);

  for (const key of new Set(keys)) {
    assert.ok(translations['pt-BR'][key], `pt-BR: ${key}`);
    assert.ok(translations['en-US'][key], `en-US: ${key}`);
  }
});

test('o portfolio possui propriedade, limite e exclusao em cascata', () => {
  const database = new DatabaseSync(':memory:');
  database.exec(read('migrations/0001_initial.sql'));
  database.exec(read('migrations/0002_password_reset.sql'));
  database.exec(read('migrations/0003_professional_profiles.sql'));
  database.exec(read('migrations/0004_portfolio_items.sql'));
  const table = database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'portfolio_items'").get();
  assert.match(table.sql, /user_id INTEGER NOT NULL REFERENCES users\(id\) ON DELETE CASCADE/);
  assert.match(table.sql, /object_key TEXT NOT NULL UNIQUE/);
  assert.match(table.sql, /alt_text TEXT NOT NULL/);
  assert.match(read('src/worker.mjs'), /MAX_PORTFOLIO_ITEMS = 12/);
  database.close();
});

test('o portfolio autenticado permite envio, ordem, textos e exclusao', () => {
  const page = read('public/perfil.html');
  const script = read('public/profile-api.js');
  const styles = read('public/account.css');
  assert.match(page, /id="portfolioUploadForm"/);
  assert.match(page, /id="portfolioAltText"[^>]*required/);
  assert.match(page, /id="savePortfolioButton"/);
  assert.match(script, /new FormData\(\)/);
  assert.match(script, /\/api\/account\/portfolio/);
  assert.match(script, /portfolioItems\[index - 1\]/);
  assert.doesNotMatch(script, /innerHTML\s*=/);
  assert.match(styles, /\.portfolio-list/);
});

test('a galeria publica so usa imagens autorizadas e textos seguros', () => {
  const page = read('public/fotografo.html');
  const script = read('public/photographer-profile.js');
  const worker = read('src/worker.mjs');
  const router = read('src/router.mjs');
  assert.match(page, /id="portfolioSection" hidden/);
  assert.match(script, /image\.alt = item\.altText/);
  assert.match(script, /caption\.textContent = item\.caption/);
  assert.doesNotMatch(script, /innerHTML\s*=/);
  assert.match(worker, /p\.is_published = 1 AND u\.role = 'photographer'/);
  assert.match(router, /id: 'photographers\.portfolio-image'/);
  assert.match(worker, /routeId === 'photographers\.portfolio-image'/);
  assert.match(worker, /portfolioItem\(item, profile\.slug\)/);
  assert.match(worker, /\/api\/photographers\/\$\{encodeURIComponent\(slug\)\}\/portfolio\/\$\{id\}/);
  assert.match(worker, /portfolioObjects/);
});

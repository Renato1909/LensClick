import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

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
  const translations = read('public/lang.js');
  const keys = [...`${accountPage}\n${publicPage}`.matchAll(/data-i18n="([^"]+)"/g)].map((match) => match[1]);

  for (const key of new Set(keys)) {
    assert.equal(translations.split(`'${key}':`).length - 1, 2, key);
  }
});

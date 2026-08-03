import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (file) => readFileSync(resolve(file), 'utf8');

test('a central da conta oferece dados, segurança e remoção de foto', () => {
  const page = read('public/perfil.html');
  const script = read('public/profile-api.js');
  const styles = read('public/account.css');

  assert.match(page, /id="profileForm"/);
  assert.match(page, /id="passwordForm"/);
  assert.match(page, /id="removePhotoDialog"/);
  assert.match(page, /id="emailPasswordGroup" hidden/);
  assert.match(page, /autocomplete="current-password"/);
  assert.match(page, /autocomplete="new-password"/);
  assert.match(script, /\/api\/account\/password/);
  assert.match(script, /\/api\/account\/photo/);
  assert.match(script, /currentPassword: emailCurrentPassword\.value/);
  assert.match(styles, /\.settings-grid/);
  assert.match(styles, /@media \(max-width: 620px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});

test('o gerenciamento da conta possui tradução completa em português e inglês', () => {
  const page = read('public/perfil.html');
  const translations = read('public/lang.js');
  const keys = [...page.matchAll(/data-i18n="([^"]+)"/g)].map((match) => match[1]);

  for (const key of new Set(keys)) {
    assert.equal(translations.split(`'${key}':`).length - 1, 2, key);
  }
});

test('o Worker protege alterações sensíveis e revoga outras sessões', () => {
  const worker = read('src/worker.mjs');

  assert.match(worker, /emailChanged[\s\S]*verifyPassword/);
  assert.match(worker, /\/api\/account\/password/);
  assert.match(worker, /DELETE FROM sessions WHERE user_id = \? AND token_hash <> \?/);
  assert.match(worker, /DELETE FROM password_reset_tokens WHERE user_id = \?/);
  assert.match(worker, /\/api\/account\/photo/);
  assert.match(worker, /PROFILE_IMAGES\.delete\(current\.profile_pic_key\)/);
});

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
  assert.match(page, /id="deleteAccountDialog"/);
  assert.match(page, /id="deleteCurrentPassword"/);
  assert.match(page, /id="deleteConfirmation"/);
  assert.match(page, /id="emailPasswordGroup" hidden/);
  assert.match(page, /autocomplete="current-password"/);
  assert.match(page, /autocomplete="new-password"/);
  assert.match(script, /\/api\/account\/password/);
  assert.match(script, /\/api\/account\/photo/);
  assert.match(script, /method: 'DELETE'/);
  assert.match(script, /expectedDeletionPhrase/);
  assert.match(script, /login\.html\?accountDeleted=1/);
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
  const router = read('src/router.mjs');

  assert.match(worker, /emailChanged[\s\S]*verifyPassword/);
  assert.match(router, /id: 'account\.password\.update', method: 'PUT', path: '\/api\/account\/password'/);
  assert.match(worker, /DELETE FROM sessions WHERE user_id = \? AND token_hash <> \?/);
  assert.match(worker, /DELETE FROM password_reset_tokens WHERE user_id = \?/);
  assert.match(router, /id: 'account\.photo\.delete', method: 'DELETE', path: '\/api\/account\/photo'/);
  assert.match(worker, /PROFILE_IMAGES\.delete\(current\.profile_pic_key\)/);
  assert.match(router, /id: 'account\.delete', method: 'DELETE', path: '\/api\/account'/);
  assert.match(worker, /routeId === 'account\.delete'/);
  assert.doesNotMatch(worker, /DELETE FROM contact_messages WHERE email = \? COLLATE NOCASE/);
  assert.doesNotMatch(worker, /DELETE FROM newsletter_subscriptions WHERE email = \? COLLATE NOCASE/);
  assert.match(worker, /DELETE FROM users WHERE id = \?/);
});

test('a politica explica retencao e exclusao em ambos os idiomas', () => {
  const privacy = read('public/privacidade.html');
  const translations = read('public/lang.js');

  assert.match(privacy, /data-i18n="privacy\.sec7\.title"/);
  assert.match(privacy, /data-i18n="privacy\.sec9\.p"/);
  assert.match(translations, /'privacy\.sec7\.title': '7\. Retenção e Exclusão'/);
  assert.match(translations, /'privacy\.sec7\.title': '7\. Retention and Deletion'/);
  assert.match(translations, /identificadores irreversíveis e expiram automaticamente/);
  assert.match(translations, /irreversible identifiers and expire automatically/);
});

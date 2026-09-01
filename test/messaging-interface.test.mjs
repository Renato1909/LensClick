import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readCatalogs } from '../test-utils/i18n.mjs';

const read = (file) => readFileSync(resolve(file), 'utf8');

test('perfil publico inicia conversa privada e a conta oferece inbox acessivel', () => {
  const publicPage = read('public/fotografo.html');
  const accountPage = read('public/perfil.html');
  const script = read('public/messaging.js');

  assert.match(publicPage, /id="conversationStartForm"[^>]*hidden/);
  assert.match(publicPage, /id="conversationStartMessage"[^>]*maxlength="2000"/);
  assert.match(accountPage, /id="messagingDashboard"/);
  assert.match(accountPage, /id="conversationList"/);
  assert.doesNotMatch(script, /setAttribute\('role', 'listitem'\)/);
  assert.match(accountPage, /id="messageList"[^>]*role="log"[^>]*aria-live="polite"/);
  assert.match(script, /\/api\/photographers\/\$\{encodeURIComponent\(slug\)\}\/conversations/);
  assert.match(script, /\/api\/account\/conversations/);
  assert.match(script, /senderUserId/);
  assert.doesNotMatch(script, /innerHTML\s*=/);
});

test('interface de mensagens e responsiva, reduz movimento e usa tokens do design system', () => {
  const styles = read('public/messaging.css');
  assert.match(styles, /grid-template-columns: minmax\(220px, \.8fr\) minmax\(0, 1\.7fr\)/);
  assert.match(styles, /@media \(max-width: 760px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /var\(--lc-color-line\)/);
  assert.match(styles, /var\(--lc-radius-lg\)/);
});

test('mensagens possuem o mesmo contrato bilingue em portugues e ingles', () => {
  const catalogs = readCatalogs();
  const keys = Object.keys(catalogs['pt-BR']).filter((key) => key.startsWith('messaging.'));
  assert.equal(keys.length, 21);
  for (const key of keys) {
    assert.ok(catalogs['en-US'][key], `en-US: ${key}`);
    assert.notEqual(catalogs['pt-BR'][key], catalogs['en-US'][key], key);
  }
});

test('reputacao publica acompanha a URL amigavel do perfil', () => {
  const reputation = read('public/reputation.js');
  assert.match(reputation, /window\.location\.pathname\.match\(\/\^\\\/fotografo/);
  assert.match(reputation, /new URLSearchParams\(window\.location\.search\)\.get\('perfil'\)/);
});

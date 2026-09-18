import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readCatalogs } from '../test-utils/i18n.mjs';

test('recuperacao de senha possui telas bilingues e integracao segura', () => {
  const login = readFileSync('public/login.html', 'utf8');
  const requestPage = readFileSync('public/recuperar-senha.html', 'utf8');
  const confirmPage = readFileSync('public/redefinir-senha.html', 'utf8');
  const requestScript = readFileSync('public/password-recovery.js', 'utf8');
  const confirmScript = readFileSync('public/password-reset.js', 'utf8');
  const translations = readCatalogs();
  const worker = readFileSync('src/worker.mjs', 'utf8');
  const auth = readFileSync('src/auth.mjs', 'utf8');

  assert.match(login, /href="recuperar-senha\.html"/);
  assert.match(requestPage, /src="password-recovery\.js"/);
  assert.match(confirmPage, /src="password-reset\.js"/);
  assert.match(requestScript, /\/api\/auth\/password-reset\/request/);
  assert.match(confirmScript, /\/api\/auth\/password-reset\/confirm/);
  assert.ok(translations['pt-BR']['recovery.request.title']);
  assert.ok(translations['en-US']['recovery.request.title']);
  assert.ok(translations['pt-BR']['recovery.confirm.title']);
  assert.ok(translations['en-US']['recovery.confirm.title']);
  assert.match(worker, /PASSWORD_RESET_TTL_MS = 30 \* 60 \* 1000/);
  assert.match(auth, /DELETE FROM sessions WHERE user_id = \?/);
  assert.match(auth, /Se o e-mail estiver cadastrado/);
  assert.doesNotMatch(worker, /password_reset_tokens \([^)]*token[^_]/);
});

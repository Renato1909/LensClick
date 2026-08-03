import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('recuperacao de senha possui telas bilingues e integracao segura', () => {
  const login = readFileSync('public/login.html', 'utf8');
  const requestPage = readFileSync('public/recuperar-senha.html', 'utf8');
  const confirmPage = readFileSync('public/redefinir-senha.html', 'utf8');
  const translations = readFileSync('public/lang.js', 'utf8');
  const worker = readFileSync('src/worker.mjs', 'utf8');

  assert.match(login, /href="recuperar-senha\.html"/);
  assert.match(requestPage, /\/api\/auth\/password-reset\/request/);
  assert.match(confirmPage, /\/api\/auth\/password-reset\/confirm/);
  assert.equal((translations.match(/'recovery\.request\.title':/g) || []).length, 2);
  assert.equal((translations.match(/'recovery\.confirm\.title':/g) || []).length, 2);
  assert.match(worker, /PASSWORD_RESET_TTL_MS = 30 \* 60 \* 1000/);
  assert.match(worker, /DELETE FROM sessions WHERE user_id = \?/);
  assert.match(worker, /Se o e-mail estiver cadastrado/);
  assert.doesNotMatch(worker, /password_reset_tokens \([^)]*token[^_]/);
});

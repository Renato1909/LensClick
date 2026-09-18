import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runChecks } from '../scripts/lint.mjs';

test('lint do frontend não encontra violações', () => {
  assert.deepEqual(runChecks(), []);
});

test('lint está ligado ao package.json e aos workflows', () => {
  const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));
  assert.equal(pkg.scripts.lint, 'node scripts/lint.mjs');

  const quality = readFileSync(resolve('.github/workflows/quality.yml'), 'utf8');
  assert.match(quality, /npm run lint/);

  const deploy = readFileSync(resolve('.github/workflows/deploy.yml'), 'utf8');
  assert.match(deploy, /npm run lint/);
});

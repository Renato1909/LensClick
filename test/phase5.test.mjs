import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('a Fase 5 prioriza recursos essenciais e adia os demais', () => {
  const home = readFileSync(resolve('public', 'index.html'), 'utf8');
  const styles = readFileSync(resolve('public', 'refinements.css'), 'utf8');
  const worker = readFileSync(resolve('src', 'worker.mjs'), 'utf8');

  assert.match(home, /rel="preload" as="image"[^>]+fetchpriority="high"/);
  assert.equal((home.match(/loading="lazy" decoding="async"/g) || []).length, 13);
  assert.equal((home.match(/data-background="https:\/\/images\.unsplash\.com/g) || []).length, 2);
  assert.match(home, /function prepareSlide/);
  assert.match(home, /requestIdleCallback/);
  assert.match(home, /setActive, \{ passive: true \}/);
  assert.match(styles, /content-visibility:\s*auto/);
  assert.match(styles, /contain-intrinsic-size:\s*auto 900px/);
  assert.match(worker, /request\.headers\.get\('If-None-Match'\)/);
  assert.match(worker, /status:\s*304/);
});

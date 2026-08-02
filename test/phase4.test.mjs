import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('a Fase 4 oferece microinteracoes com movimento reduzido', () => {
  const styles = readFileSync(resolve('public', 'refinements.css'), 'utf8');
  const ux = readFileSync(resolve('public', 'ux.js'), 'utf8');
  const home = readFileSync(resolve('public', 'index.html'), 'utf8');

  assert.match(styles, /button\.is-loading::after/);
  assert.match(styles, /@keyframes lc-feedback-in/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /\.btn:active/);
  assert.match(styles, /--lc-duration-base:\s*240ms/);
  assert.match(styles, /transition-duration:\s*var\(--lc-duration-base\)/);
  assert.match(styles, /cubic-bezier\(0\.2, 0\.75, 0\.25, 1\)/);
  assert.doesNotMatch(styles, /translateY\(1px\) scale\(0\.985\)/);
  assert.match(ux, /function installFieldFeedback/);
  assert.match(ux, /function prefersReducedMotion/);
  assert.match(home, /UX\.highlight\(serviceSelect\)/);
  assert.match(home, /carousel\.addEventListener\('focusin', stopCarousel\)/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (...parts) => readFileSync(resolve(...parts), 'utf8');

test('a Fase 7 centraliza os tokens visuais da LensClick', () => {
  const styles = read('public', 'refinements.css');
  const requiredTokens = [
    '--lc-color-brand-primary',
    '--lc-color-brand-secondary',
    '--lc-color-bg',
    '--lc-color-text',
    '--lc-color-success',
    '--lc-space-4',
    '--lc-radius-md',
    '--lc-shadow-md',
    '--lc-control-height',
    '--lc-duration-base',
    '--lc-ease-standard'
  ];

  requiredTokens.forEach(token => assert.match(styles, new RegExp(`${token}:`)));
  for (const alias of ['--accent-1', '--text', '--radius', '--shadow', '--shadow-soft', '--card-bg']) {
    assert.doesNotMatch(styles, new RegExp(`${alias}\\s*:`));
  }
});

test('paginas ativas consomem uma unica fonte de tokens', () => {
  ['index.html', 'login.html', 'cadastro.html', 'perfil.html'].forEach((page) => {
    assert.doesNotMatch(read('public', page), /:root\s*\{/);
  });

  const styles = read('public', 'refinements.css');
  assert.match(styles, /min-height:\s*var\(--lc-control-height\)/);
  assert.match(styles, /border-radius:\s*var\(--lc-radius-md\)/);
  assert.match(styles, /box-shadow:\s*var\(--lc-shadow-brand\)/);
  assert.match(styles, /transition-duration:\s*var\(--lc-duration-base\)/);
});

test('o Design System esta documentado para a equipe', () => {
  const guide = read('DESIGN_SYSTEM.md');
  const readme = read('README.md');

  assert.match(guide, /## Princípios/);
  assert.match(guide, /## Tokens oficiais/);
  assert.match(guide, /## Componentes/);
  assert.match(guide, /## Compatibilidade/);
  assert.match(readme, /`DESIGN_SYSTEM\.md`/);
});

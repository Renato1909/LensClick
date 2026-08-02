import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const documentation = readFileSync('docs/DOCUMENTACAO_TECNICA.md', 'utf8');

test('a Fase 9 documenta arquitetura, codigo, seguranca e operacao', () => {
  for (const section of [
    '## 3. Arquitetura',
    '## 5. Front-end',
    '## 6. Back-end',
    '## 10. Seguranca',
    '## 12. Testes e qualidade',
    '## 13. Implantacao e operacao'
  ]) {
    assert.match(documentation, new RegExp(section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('a documentacao inclui MER, DER e fluxos tecnicos', () => {
  assert.match(documentation, /### 8\.1 MER/);
  assert.match(documentation, /### 8\.2 DER/);
  assert.match(documentation, /erDiagram/);
  assert.ok((documentation.match(/```mermaid/g) || []).length >= 6);
});

test('README e operacao apontam para o ambiente publicado', () => {
  const readme = readFileSync('README.md', 'utf8');
  const cloudflare = readFileSync('CLOUDFLARE_SETUP.md', 'utf8');
  assert.match(readme, /docs\/DOCUMENTACAO_TECNICA\.md/);
  assert.match(readme, /lensclick\.renato-aparecido-business\.workers\.dev/);
  assert.match(cloudflare, /foi publicado/);
});

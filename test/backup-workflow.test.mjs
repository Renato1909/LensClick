import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowUrl = new URL('../.github/workflows/backup.yml', import.meta.url);
const procedureUrl = new URL('../docs/BACKUP_D1.md', import.meta.url);

test('backup exporta o D1 e envia o arquivo para o R2 remoto', async () => {
  const workflow = await readFile(workflowUrl, 'utf8');
  const upload = workflow.match(/npx wrangler r2 object put \\\s*[\s\S]*?--content-type "application\/sql"/)?.[0] || '';

  assert.match(workflow, /npx wrangler d1 export "\$DATABASE_NAME" --remote/);
  assert.match(upload, /--remote/);
  assert.match(upload, /--file "\$ARQUIVO"/);
  assert.match(workflow, /Objeto remoto confirmado: \$\{BACKUP_BUCKET\}\/\$\{OBJETO\}/);
  assert.match(workflow, /any\(\.result\[\]\?; \.key == \$objeto\)/);
});

test('retencao usa a data do nome do backup e preserva objetos fora do padrao', async () => {
  const workflow = await readFile(workflowUrl, 'utf8');

  assert.match(workflow, /backup-\[0-9\]\{8\}T\[0-9\]\{6\}Z/);
  assert.match(workflow, /strptime\("%Y%m%dT%H%M%SZ"\)/);
  assert.doesNotMatch(workflow, /\.uploaded \| sub/);
});

test('procedimento documenta o escopo D1 e o download remoto', async () => {
  const procedure = await readFile(procedureUrl, 'utf8');

  assert.match(procedure, /D1 Edit/);
  assert.match(procedure, /r2 object get[\s\S]*?--remote[\s\S]*?--file restore\.sql/);
});

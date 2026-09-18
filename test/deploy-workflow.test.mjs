import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const qualityUrl = new URL('../.github/workflows/quality.yml', import.meta.url);
const deployUrl = new URL('../.github/workflows/deploy.yml', import.meta.url);

test('preview sobe o Worker local e executa o smoke contra ele', async () => {
  const workflow = await readFile(qualityUrl, 'utf8');

  assert.match(workflow, /npm run db:migrate:local/);
  assert.match(workflow, /npx wrangler dev --local --port 4174/);
  assert.match(workflow, /\/api\/health/);
  assert.match(workflow, /npm run test:smoke/);
  assert.match(workflow, /pkill -f "wrangler dev --local --port 4174"/);
});

test('deploy publica em push para main com gate e migracao antes do upload', async () => {
  const workflow = await readFile(deployUrl, 'utf8');

  assert.match(workflow, /push:\s*\n\s*branches:\s*\n\s*- main/);
  assert.match(workflow, /CLOUDFLARE_API_TOKEN/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm run check/);
  const migrateAt = workflow.indexOf('npm run db:migrate:remote');
  const deployAt = workflow.indexOf('npx wrangler deploy');
  assert.ok(migrateAt !== -1 && deployAt !== -1 && migrateAt < deployAt);
  assert.match(workflow, /\/api\/health/);
  assert.match(workflow, /cancel-in-progress: false/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(file, 'utf8');

test('a reputacao conecta perfil publico, central da conta e catalogos bilingues', () => {
  const publicProfile = read('public/fotografo.html');
  const account = read('public/perfil.html');
  const script = read('public/reputation.js');
  const pt = JSON.parse(read('public/locales/pt-BR.json'));
  const en = JSON.parse(read('public/locales/en-US.json'));

  for (const id of ['publicReviewsList', 'reviewsSummary', 'reviewRequestForm']) assert.match(publicProfile, new RegExp(`id="${id}"`));
  for (const id of ['reputationDashboard', 'reputationRequestList']) assert.match(account, new RegExp(`id="${id}"`));
  assert.match(publicProfile, /src="reputation\.js"/);
  assert.match(account, /src="reputation\.js"/);
  assert.doesNotThrow(() => new Function(script));
  assert.match(script, /review-requests/);
  assert.match(script, /account\/reviews/);
  for (const key of Object.keys(pt).filter((key) => key.startsWith('reputation.'))) assert.equal(typeof en[key], 'string', key);
});

test('a busca oferece ordenacao por avaliacao verificada', () => {
  assert.match(read('public/busca.html'), /value="rating_desc"/);
  assert.match(read('public/search.js'), /ratingAverage/);
  assert.equal(JSON.parse(read('public/locales/pt-BR.json'))['search.sort.ratingDesc'], 'Melhor avaliação');
  assert.equal(JSON.parse(read('public/locales/en-US.json'))['search.sort.ratingDesc'], 'Highest rated');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createMonitoringHandlers } from '../src/monitoring.mjs';
import { createRequestContext, reportOperationalError } from '../src/observability.mjs';
import { createWorkerFixture } from '../test-support/worker-fixture.mjs';

function makeProbe({ fail = false } = {}) {
  return async () => {
    if (fail) throw new Error('D1 indisponivel (simulado)');
  };
}

test('sonda com DB saudavel nao envia alerta e zera contador', async () => {
  const fixture = createWorkerFixture({ enableEmail: true });
  const monitoring = createMonitoringHandlers({ reportOperationalError });
  const requestContext = createRequestContext(new Request(new URL('https://lensclick.test/__scheduled')));

  fixture.env.DB.prepare('INSERT INTO monitor_state (key, value) VALUES (?, ?)').bind('probe:consecutive_failures', '3').run();

  const result = await monitoring.runAvailabilityCheck({ env: fixture.env, requestContext, probe: makeProbe() });

  assert.equal(result.healthy, true);
  assert.equal(result.alertSent, false);
  assert.equal(fixture.sentEmails.length, 0);
  const counter = fixture.env.DB.prepare('SELECT value FROM monitor_state WHERE key = ?').bind('probe:consecutive_failures').first('value');
  assert.equal(counter, '0');
  await fixture.close();
});

test('primeira falha incrementa contador mas nao envia alerta', async () => {
  const fixture = createWorkerFixture({ enableEmail: true });
  const monitoring = createMonitoringHandlers({ reportOperationalError });
  const requestContext = createRequestContext(new Request(new URL('https://lensclick.test/__scheduled')));

  const result = await monitoring.runAvailabilityCheck({ env: fixture.env, requestContext, probe: makeProbe({ fail: true }) });

  assert.equal(result.healthy, false);
  assert.equal(result.alertSent, false);
  assert.equal(result.failures, 1);
  assert.equal(fixture.sentEmails.length, 0);
  await fixture.close();
});

test('segunda falha consecutiva envia alerta por e-mail', async () => {
  const fixture = createWorkerFixture({ enableEmail: true });
  const monitoring = createMonitoringHandlers({ reportOperationalError });
  const requestContext = createRequestContext(new Request(new URL('https://lensclick.test/__scheduled')));

  await monitoring.runAvailabilityCheck({ env: fixture.env, requestContext, probe: makeProbe({ fail: true }) });
  const result = await monitoring.runAvailabilityCheck({ env: fixture.env, requestContext, probe: makeProbe({ fail: true }) });

  assert.equal(result.healthy, false);
  assert.equal(result.alertSent, true);
  assert.equal(result.failures, 2);
  assert.equal(fixture.sentEmails.length, 1);
  const body = fixture.sentEmails[0].body;
  assert.equal(body.subject, '[LensClick] SLO: disponibilidade abaixo do limite');
  assert.match(body.textContent, /D1 indisponivel \(simulado\)/);
  assert.match(body.textContent, /GET \/api\/health/);
  assert.match(body.textContent, /docs\/OBSERVABILIDADE.md/);
  assert.match(body.textContent, /Nenhum dado de usuario/);
  const lastAlert = fixture.env.DB.prepare('SELECT value FROM monitor_state WHERE key = ?').bind('probe:last_alert_at').first('value');
  assert.ok(lastAlert, 'last_alert_at deve ser registrado');
  await fixture.close();
});

test('respeita cooldown: terceira falha dentro da janela nao reenvia e-mail', async () => {
  const fixture = createWorkerFixture({ enableEmail: true });
  const monitoring = createMonitoringHandlers({ reportOperationalError });
  const requestContext = createRequestContext(new Request(new URL('https://lensclick.test/__scheduled')));

  await monitoring.runAvailabilityCheck({ env: fixture.env, requestContext, probe: makeProbe({ fail: true }) });
  await monitoring.runAvailabilityCheck({ env: fixture.env, requestContext, probe: makeProbe({ fail: true }) });
  const third = await monitoring.runAvailabilityCheck({ env: fixture.env, requestContext, probe: makeProbe({ fail: true }) });

  assert.equal(third.failures, 3);
  assert.equal(third.alertSent, false);
  assert.equal(fixture.sentEmails.length, 1, 'apenas um e-mail dentro do cooldown');
  await fixture.close();
});

test('recuperacao apos falhas zera o contador', async () => {
  const fixture = createWorkerFixture({ enableEmail: true });
  const monitoring = createMonitoringHandlers({ reportOperationalError });
  const requestContext = createRequestContext(new Request(new URL('https://lensclick.test/__scheduled')));

  await monitoring.runAvailabilityCheck({ env: fixture.env, requestContext, probe: makeProbe({ fail: true }) });
  await monitoring.runAvailabilityCheck({ env: fixture.env, requestContext, probe: makeProbe({ fail: true }) });
  assert.equal(fixture.sentEmails.length, 1);

  const recovered = await monitoring.runAvailabilityCheck({ env: fixture.env, requestContext, probe: makeProbe() });
  assert.equal(recovered.healthy, true);
  assert.equal(recovered.failures, 0);
  const counter = fixture.env.DB.prepare('SELECT value FROM monitor_state WHERE key = ?').bind('probe:consecutive_failures').first('value');
  assert.equal(counter, '0');
  await fixture.close();
});

test('sem configuracao Brevo nao envia e-mail mas registra estado', async () => {
  const fixture = createWorkerFixture({ enableEmail: false });
  const monitoring = createMonitoringHandlers({ reportOperationalError });
  const requestContext = createRequestContext(new Request(new URL('https://lensclick.test/__scheduled')));

  await monitoring.runAvailabilityCheck({ env: fixture.env, requestContext, probe: makeProbe({ fail: true }) });
  const result = await monitoring.runAvailabilityCheck({ env: fixture.env, requestContext, probe: makeProbe({ fail: true }) });

  assert.equal(result.alertSent, false);
  assert.equal(fixture.sentEmails.length, 0);
  assert.equal(result.failures, 2);
  await fixture.close();
});

function seedBucket(env, minute, { total = 0, errors5xx = 0, apiTotal = 0, lt50 = 0, lt100 = 0, lt300 = 0, lt500 = 0, lt1000 = 0, gte1000 = 0 } = {}) {
  env.DB.prepare(
    `INSERT INTO monitor_minute_buckets (bucket_minute, total, errors_5xx, api_total, api_lt50, api_lt100, api_lt300, api_lt500, api_lt1000, api_gte1000)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(bucket_minute) DO UPDATE SET
       total = total + excluded.total,
       errors_5xx = errors_5xx + excluded.errors_5xx,
       api_total = api_total + excluded.api_total,
       api_lt50 = api_lt50 + excluded.api_lt50,
       api_lt100 = api_lt100 + excluded.api_lt100,
       api_lt300 = api_lt300 + excluded.api_lt300,
       api_lt500 = api_lt500 + excluded.api_lt500,
       api_lt1000 = api_lt1000 + excluded.api_lt1000,
       api_gte1000 = api_gte1000 + excluded.api_gte1000`
  ).bind(minute, total, errors5xx, apiTotal, lt50, lt100, lt300, lt500, lt1000, gte1000).run();
}

function minuteOf(date) {
  return date.toISOString().slice(0, 16);
}

test('amostragem agrega contadores por minuto sem dados de usuario', async () => {
  const fixture = createWorkerFixture({ enableEmail: true });
  const { recordRequestSample } = await import('../src/monitoring.mjs');

  await recordRequestSample(fixture.env, { durationMs: 40, status: 200, isApi: true });
  await recordRequestSample(fixture.env, { durationMs: 120, status: 200, isApi: true });
  await recordRequestSample(fixture.env, { durationMs: 450, status: 500, isApi: true });
  await recordRequestSample(fixture.env, { durationMs: 30, status: 200, isApi: false });

  const row = fixture.env.DB.prepare('SELECT * FROM monitor_minute_buckets').first();
  assert.equal(row.total, 4);
  assert.equal(row.errors_5xx, 1);
  assert.equal(row.api_total, 3);
  assert.equal(row.api_lt50, 1);
  assert.equal(row.api_lt300, 1);
  assert.equal(row.api_lt500, 1);
  await fixture.close();
});

test('P95 abaixo do limiar nao envia alerta', async () => {
  const fixture = createWorkerFixture({ enableEmail: true });
  const monitoring = createMonitoringHandlers({ reportOperationalError });
  const requestContext = createRequestContext(new Request(new URL('https://lensclick.test/__scheduled')));
  const now = Date.now();

  seedBucket(fixture.env, minuteOf(new Date(now - 5 * 60 * 1000)), { total: 12, apiTotal: 12, lt50: 10, lt100: 2 });

  const result = await monitoring.runPerformanceCheck({ env: fixture.env, requestContext, now });
  assert.equal(result.p95, 100);
  assert.equal(result.p95AlertSent, false);
  assert.equal(fixture.sentEmails.length, 0);
  await fixture.close();
});

test('P95 acima do limiar envia alerta e respeita cooldown', async () => {
  const fixture = createWorkerFixture({ enableEmail: true });
  const monitoring = createMonitoringHandlers({ reportOperationalError });
  const requestContext = createRequestContext(new Request(new URL('https://lensclick.test/__scheduled')));
  const now = Date.now();

  seedBucket(fixture.env, minuteOf(new Date(now - 5 * 60 * 1000)), { total: 12, apiTotal: 12, lt50: 5, lt500: 7 });

  const first = await monitoring.runPerformanceCheck({ env: fixture.env, requestContext, now });
  assert.equal(first.p95, 500);
  assert.equal(first.p95AlertSent, true);
  assert.equal(fixture.sentEmails.length, 1);
  const body = fixture.sentEmails[0].body;
  assert.equal(body.subject, '[LensClick] SLO: latencia P95 acima do limite');
  assert.match(body.textContent, /P95 < 300 ms/);
  assert.match(body.textContent, /docs\/OBSERVABILIDADE.md/);
  assert.match(body.textContent, /Nenhum dado de usuario/);

  const second = await monitoring.runPerformanceCheck({ env: fixture.env, requestContext, now });
  assert.equal(second.p95AlertSent, false, 'cooldown impede reenvio');
  assert.equal(fixture.sentEmails.length, 1);
  await fixture.close();
});

test('P95 no bucket lt300 (100-299 ms) nao dispara alerta', async () => {
  const fixture = createWorkerFixture({ enableEmail: true });
  const monitoring = createMonitoringHandlers({ reportOperationalError });
  const requestContext = createRequestContext(new Request(new URL('https://lensclick.test/__scheduled')));
  const now = Date.now();

  // P95 cai no bucket lt300: fronteira retornada e 300, mas o P95 real e < 300 ms.
  seedBucket(fixture.env, minuteOf(new Date(now - 5 * 60 * 1000)), { total: 20, apiTotal: 20, lt50: 10, lt300: 10 });

  const result = await monitoring.runPerformanceCheck({ env: fixture.env, requestContext, now });
  assert.equal(result.p95, 300);
  assert.equal(result.p95AlertSent, false, 'fronteira 300 nao deve alertar: P95 real e menor que 300 ms');
  assert.equal(fixture.sentEmails.length, 0);
  await fixture.close();
});

test('amostragem nunca lanca excecao quando o DB falha', async () => {
  const { recordRequestSample } = await import('../src/monitoring.mjs');
  const brokenEnv = {
    DB: {
      prepare() {
        return {
          bind() {
            return { run: async () => { throw new Error('D1 indisponivel (simulado)'); } };
          }
        };
      }
    }
  };

  await recordRequestSample(brokenEnv, { durationMs: 10, status: 200, isApi: true });
  // Se nao lancou, a propriedade best-effort esta garantida.
});

test('P95 com poucas amostras nao dispara alerta', async () => {
  const fixture = createWorkerFixture({ enableEmail: true });
  const monitoring = createMonitoringHandlers({ reportOperationalError });
  const requestContext = createRequestContext(new Request(new URL('https://lensclick.test/__scheduled')));
  const now = Date.now();

  seedBucket(fixture.env, minuteOf(new Date(now - 5 * 60 * 1000)), { total: 3, apiTotal: 3, gte1000: 3 });

  const result = await monitoring.runPerformanceCheck({ env: fixture.env, requestContext, now });
  assert.equal(result.p95, null);
  assert.equal(result.p95AlertSent, false);
  assert.equal(fixture.sentEmails.length, 0);
  await fixture.close();
});

test('taxa de 5xx acima do limiar envia alerta e respeita cooldown', async () => {
  const fixture = createWorkerFixture({ enableEmail: true });
  const monitoring = createMonitoringHandlers({ reportOperationalError });
  const requestContext = createRequestContext(new Request(new URL('https://lensclick.test/__scheduled')));
  const now = Date.now();

  seedBucket(fixture.env, minuteOf(new Date(now - 5 * 60 * 1000)), { total: 100, errors5xx: 2, apiTotal: 100, lt50: 100 });

  const first = await monitoring.runPerformanceCheck({ env: fixture.env, requestContext, now });
  assert.equal(first.errorRate, 0.02);
  assert.equal(first.errorRateAlertSent, true);
  assert.equal(fixture.sentEmails.length, 1);
  const body = fixture.sentEmails[0].body;
  assert.equal(body.subject, '[LensClick] SLO: taxa de 5xx acima do limite');
  assert.match(body.textContent, /2\.00%/);
  assert.match(body.textContent, /Nenhum dado de usuario/);

  const second = await monitoring.runPerformanceCheck({ env: fixture.env, requestContext, now });
  assert.equal(second.errorRateAlertSent, false);
  assert.equal(fixture.sentEmails.length, 1);
  await fixture.close();
});

test('taxa de 5xx com volume baixo nao dispara alerta', async () => {
  const fixture = createWorkerFixture({ enableEmail: true });
  const monitoring = createMonitoringHandlers({ reportOperationalError });
  const requestContext = createRequestContext(new Request(new URL('https://lensclick.test/__scheduled')));
  const now = Date.now();

  seedBucket(fixture.env, minuteOf(new Date(now - 5 * 60 * 1000)), { total: 3, errors5xx: 1, apiTotal: 3, lt50: 3 });

  const result = await monitoring.runPerformanceCheck({ env: fixture.env, requestContext, now });
  assert.equal(result.errorRate, null);
  assert.equal(result.errorRateAlertSent, false);
  assert.equal(fixture.sentEmails.length, 0);
  await fixture.close();
});

test('buckets antigos sao removidos e ignorados pela janela', async () => {
  const fixture = createWorkerFixture({ enableEmail: true });
  const monitoring = createMonitoringHandlers({ reportOperationalError });
  const requestContext = createRequestContext(new Request(new URL('https://lensclick.test/__scheduled')));
  const now = Date.now();

  seedBucket(fixture.env, minuteOf(new Date(now - 48 * 60 * 60 * 1000)), { total: 500, errors5xx: 500, apiTotal: 500, gte1000: 500 });

  const result = await monitoring.runPerformanceCheck({ env: fixture.env, requestContext, now });
  assert.equal(result.p95, null);
  assert.equal(result.errorRate, null);
  assert.equal(fixture.sentEmails.length, 0);
  const remaining = fixture.env.DB.prepare('SELECT COUNT(*) AS n FROM monitor_minute_buckets').first('n');
  assert.equal(Number(remaining), 0, 'buckets com mais de 24h devem ser removidos');
  await fixture.close();
});

test('sem configuracao Brevo os alertas de performance nao enviam e-mail', async () => {
  const fixture = createWorkerFixture({ enableEmail: false });
  const monitoring = createMonitoringHandlers({ reportOperationalError });
  const requestContext = createRequestContext(new Request(new URL('https://lensclick.test/__scheduled')));
  const now = Date.now();

  seedBucket(fixture.env, minuteOf(new Date(now - 5 * 60 * 1000)), { total: 100, errors5xx: 5, apiTotal: 100, gte1000: 100 });

  const result = await monitoring.runPerformanceCheck({ env: fixture.env, requestContext, now });
  assert.equal(result.p95AlertSent, false);
  assert.equal(result.errorRateAlertSent, false);
  assert.equal(fixture.sentEmails.length, 0);
  await fixture.close();
});

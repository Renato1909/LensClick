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

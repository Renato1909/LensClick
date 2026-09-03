const MONITOR_FAILURE_KEY = 'probe:consecutive_failures';
const MONITOR_LAST_ALERT_KEY = 'probe:last_alert_at';
const MONITOR_LAST_P95_ALERT_KEY = 'probe:last_p95_alert_at';
const MONITOR_LAST_5XX_ALERT_KEY = 'probe:last_5xx_alert_at';
const CONSECUTIVE_FAILURE_THRESHOLD = 2;
const COOLDOWN_MS = 60 * 60 * 1000;

// Fase 4.4: limiares conservadores (docs/OBSERVABILIDADE.md secao 9).
const P95_THRESHOLD_MS = 300;
const P95_WINDOW_MINUTES = 15;
const P95_MIN_SAMPLES = 10;
const ERROR_RATE_THRESHOLD = 0.005; // 0,5%
const ERROR_RATE_WINDOW_MINUTES = 10;
const ERROR_RATE_MIN_SAMPLES = 20;
const BUCKET_RETENTION_HOURS = 24;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function readState(env, key) {
  const row = env.DB.prepare('SELECT value FROM monitor_state WHERE key = ?').bind(key).first('value');
  return row ?? null;
}

function writeState(env, key, value) {
  env.DB.prepare(
    `INSERT INTO monitor_state (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`
  ).bind(key, value).run();
}

async function sendOperationalAlert(env, { subject, text, html }) {
  if (!env.BREVO_API_KEY || !env.BREVO_SENDER_EMAIL) return false;
  const senderName = env.BREVO_SENDER_NAME || 'LensClick';
  const emailFetch = typeof env.BREVO_FETCH === 'function' ? env.BREVO_FETCH : fetch;
  try {
    const response = await emailFetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'api-key': env.BREVO_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sender: { name: senderName, email: env.BREVO_SENDER_EMAIL },
        to: [{ email: env.BREVO_SENDER_EMAIL }],
        subject,
        textContent: text,
        htmlContent: html
      })
    });
    return response.ok;
  } catch (error) {
    return false;
  }
}

async function sendAvailabilityAlert(env, { failures, windowMinutes, observedError, runbookUrl }) {
  const safeError = escapeHtml(observedError);
  const text =
    `A sonda de disponibilidade do LensClick detectou ${failures} falha(s) consecutiva(s) nos ultimos ~${windowMinutes} min.\n\n` +
    `Rota: GET /api/health (D1)\nValor observado: ${observedError}\nRunbook: ${runbookUrl}\n\n` +
    `Esta e uma mensagem operacional automatica. Nenhum dado de usuario foi incluido.`;
  const html =
    `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#17182a">` +
    `<h1 style="font-size:20px">Alerta de disponibilidade</h1>` +
    `<p>A sonda do LensClick detectou <strong>${failures} falha(s) consecutiva(s)</strong> nos ultimos ~${windowMinutes} min.</p>` +
    `<p><strong>Rota:</strong> GET /api/health (D1)<br>` +
    `<strong>Valor observado:</strong> ${safeError}<br>` +
    `<strong>Runbook:</strong> ${runbookUrl}</p>` +
    `<p style="color:#666;font-size:13px">Mensagem operacional automatica. Nenhum dado de usuario incluido.</p>` +
    `</div>`;
  return sendOperationalAlert(env, {
    subject: '[LensClick] SLO: disponibilidade abaixo do limite',
    text,
    html
  });
}

function bucketMinuteFor(timestampMs) {
  return new Date(timestampMs).toISOString().slice(0, 16); // 'YYYY-MM-DDTHH:MM'
}

function latencyBucketColumn(durationMs) {
  if (durationMs < 50) return 'api_lt50';
  if (durationMs < 100) return 'api_lt100';
  if (durationMs < 300) return 'api_lt300';
  if (durationMs < 500) return 'api_lt500';
  if (durationMs < 1000) return 'api_lt1000';
  return 'api_gte1000';
}

// Registra uma amostra agregada por minuto. Best-effort: nunca lanca excecao
// e nunca bloqueia a resposta HTTP (o chamador usa context.waitUntil).
export async function recordRequestSample(env, { durationMs, status, isApi }) {
  try {
    const minute = bucketMinuteFor(Date.now());
    const is5xx = Number(status) >= 500 ? 1 : 0;
    const apiColumn = isApi ? latencyBucketColumn(Number(durationMs) || 0) : null;
    await env.DB.prepare(
      `INSERT INTO monitor_minute_buckets (bucket_minute, total, errors_5xx, api_total, ${apiColumn || 'api_lt50'})
       VALUES (?, 1, ?, ?, ?)
       ON CONFLICT(bucket_minute) DO UPDATE SET
         total = total + 1,
         errors_5xx = errors_5xx + excluded.errors_5xx,
         api_total = api_total + excluded.api_total${apiColumn ? `, ${apiColumn} = ${apiColumn} + 1` : ''}`
    ).bind(minute, is5xx, isApi ? 1 : 0, isApi ? 1 : 0).run();
  } catch {
    // Amostragem best-effort: falha nunca afeta a requisicao.
  }
}

function sumBuckets(rows) {
  const totals = { total: 0, errors_5xx: 0, api_total: 0, api_lt50: 0, api_lt100: 0, api_lt300: 0, api_lt500: 0, api_lt1000: 0, api_gte1000: 0 };
  for (const row of rows || []) {
    for (const key of Object.keys(totals)) totals[key] += Number(row?.[key]) || 0;
  }
  return totals;
}

// P95 aproximado a partir do histograma: retorna a fronteira superior do
// bucket onde a contagem acumulada atinge 95% das amostras. Como a fronteira
// e o teto do bucket, um retorno de 300 significa "P95 < 300 ms" (amostras
// entre 100-299 ms) - por isso o alerta usa comparacao estrita (> 300),
// disparando apenas quando o P95 cai em api_lt500 ou acima.
function approximateP95(totals) {
  if (totals.api_total < 1) return 0;
  const target = Math.ceil(totals.api_total * 0.95);
  const buckets = [
    ['api_lt50', 50],
    ['api_lt100', 100],
    ['api_lt300', 300],
    ['api_lt500', 500],
    ['api_lt1000', 1000],
    ['api_gte1000', 1000]
  ];
  let cumulative = 0;
  for (const [column, boundary] of buckets) {
    cumulative += totals[column];
    if (cumulative >= target) return boundary;
  }
  return 1000;
}

async function readWindowTotals(env, windowMinutes, nowMs) {
  const since = bucketMinuteFor(nowMs - windowMinutes * 60 * 1000);
  const { results } = await env.DB.prepare(
    'SELECT * FROM monitor_minute_buckets WHERE bucket_minute >= ?'
  ).bind(since).all();
  return sumBuckets(results);
}

async function pruneOldBuckets(env, nowMs) {
  const cutoff = bucketMinuteFor(nowMs - BUCKET_RETENTION_HOURS * 60 * 60 * 1000);
  await env.DB.prepare('DELETE FROM monitor_minute_buckets WHERE bucket_minute < ?').bind(cutoff).run();
}

function cooldownElapsed(env, key, nowMs) {
  const lastAlertAt = readState(env, key);
  return !lastAlertAt || nowMs - new Date(lastAlertAt).getTime() >= COOLDOWN_MS;
}

async function sendLatencyAlert(env, { p95, samples, windowMinutes, runbookUrl }) {
  const text =
    `A latencia P95 das rotas /api/* atingiu ~${p95} ms nas ultimas ${windowMinutes} min (${samples} amostras).\n\n` +
    `SLO: P95 < 300 ms\nValor observado: ~${p95} ms\nRunbook: ${runbookUrl}\n\n` +
    `Esta e uma mensagem operacional automatica. Nenhum dado de usuario foi incluido.`;
  const html =
    `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#17182a">` +
    `<h1 style="font-size:20px">Alerta de latencia</h1>` +
    `<p>O P95 das rotas <strong>/api/*</strong> atingiu <strong>~${p95} ms</strong> nas ultimas ${windowMinutes} min (${samples} amostras).</p>` +
    `<p><strong>SLO:</strong> P95 &lt; 300 ms<br><strong>Runbook:</strong> ${runbookUrl}</p>` +
    `<p style="color:#666;font-size:13px">Mensagem operacional automatica. Nenhum dado de usuario incluido.</p>` +
    `</div>`;
  return sendOperationalAlert(env, { subject: '[LensClick] SLO: latencia P95 acima do limite', text, html });
}

async function sendErrorRateAlert(env, { ratePercent, errors, total, windowMinutes, runbookUrl }) {
  const text =
    `A taxa de respostas 5xx atingiu ${ratePercent}% (${errors}/${total}) nos ultimos ${windowMinutes} min.\n\n` +
    `SLO: taxa de 5xx < 0,1%\nLimiar de alerta (conservador): >= 0,5% em 10 min\nValor observado: ${ratePercent}%\nRunbook: ${runbookUrl}\n\n` +
    `Esta e uma mensagem operacional automatica. Nenhum dado de usuario foi incluido.`;
  const html =
    `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#17182a">` +
    `<h1 style="font-size:20px">Alerta de erros 5xx</h1>` +
    `<p>A taxa de respostas 5xx atingiu <strong>${ratePercent}%</strong> (${errors}/${total}) nos ultimos ${windowMinutes} min.</p>` +
    `<p><strong>SLO:</strong> taxa de 5xx &lt; 0,1%<br><strong>Limiar de alerta (conservador):</strong> &ge; 0,5% em 10 min<br><strong>Runbook:</strong> ${runbookUrl}</p>` +
    `<p style="color:#666;font-size:13px">Mensagem operacional automatica. Nenhum dado de usuario incluido.</p>` +
    `</div>`;
  return sendOperationalAlert(env, { subject: '[LensClick] SLO: taxa de 5xx acima do limite', text, html });
}

export function createMonitoringHandlers({ reportOperationalError }) {
  async function runAvailabilityCheck({ env, requestContext, probe }) {
    let healthy = true;
    let observedError = null;
    try {
      await probe(env);
    } catch (error) {
      healthy = false;
      observedError = error?.message || String(error);
    }

    const previousFailures = Number(readState(env, MONITOR_FAILURE_KEY) ?? 0);

    if (healthy) {
      if (previousFailures > 0) writeState(env, MONITOR_FAILURE_KEY, '0');
      return { healthy: true, alertSent: false, failures: 0 };
    }

    const failures = previousFailures + 1;
    writeState(env, MONITOR_FAILURE_KEY, String(failures));

    let alertSent = false;
    if (failures >= CONSECUTIVE_FAILURE_THRESHOLD) {
      const lastAlertAt = readState(env, MONITOR_LAST_ALERT_KEY);
      const now = Date.now();
      const cooldownElapsed = !lastAlertAt || now - new Date(lastAlertAt).getTime() >= COOLDOWN_MS;
      if (cooldownElapsed) {
        alertSent = await sendAvailabilityAlert(env, {
          failures,
          windowMinutes: failures * 5,
          observedError,
          runbookUrl: 'docs/OBSERVABILIDADE.md'
        });
        if (alertSent) {
          writeState(env, MONITOR_LAST_ALERT_KEY, new Date(now).toISOString());
          if (requestContext && reportOperationalError) {
            reportOperationalError(requestContext, 'database.health_check.failed', 'database_error');
          }
        }
      }
    }

    return { healthy: false, alertSent, failures };
  }

  async function runPerformanceCheck({ env, requestContext, now }) {
    const nowMs = Number.isFinite(Number(now)) ? Number(now) : Date.now();
    const runbookUrl = 'docs/OBSERVABILIDADE.md';
    const result = { p95: null, p95AlertSent: false, errorRate: null, errorRateAlertSent: false };

    await pruneOldBuckets(env, nowMs);

    // Sinal 1: latencia P95 das rotas /api/* nos ultimos 15 minutos.
    const latencyTotals = await readWindowTotals(env, P95_WINDOW_MINUTES, nowMs);
    if (latencyTotals.api_total >= P95_MIN_SAMPLES) {
      const p95 = approximateP95(latencyTotals);
      result.p95 = p95;
      if (p95 > P95_THRESHOLD_MS && cooldownElapsed(env, MONITOR_LAST_P95_ALERT_KEY, nowMs)) {
        result.p95AlertSent = await sendLatencyAlert(env, {
          p95,
          samples: latencyTotals.api_total,
          windowMinutes: P95_WINDOW_MINUTES,
          runbookUrl
        });
        if (result.p95AlertSent) writeState(env, MONITOR_LAST_P95_ALERT_KEY, new Date(nowMs).toISOString());
      }
    }

    // Sinal 2: taxa de respostas 5xx nos ultimos 10 minutos.
    const errorTotals = await readWindowTotals(env, ERROR_RATE_WINDOW_MINUTES, nowMs);
    if (errorTotals.total >= ERROR_RATE_MIN_SAMPLES) {
      const rate = errorTotals.errors_5xx / errorTotals.total;
      result.errorRate = rate;
      if (rate >= ERROR_RATE_THRESHOLD && cooldownElapsed(env, MONITOR_LAST_5XX_ALERT_KEY, nowMs)) {
        result.errorRateAlertSent = await sendErrorRateAlert(env, {
          ratePercent: (rate * 100).toFixed(2),
          errors: errorTotals.errors_5xx,
          total: errorTotals.total,
          windowMinutes: ERROR_RATE_WINDOW_MINUTES,
          runbookUrl
        });
        if (result.errorRateAlertSent) writeState(env, MONITOR_LAST_5XX_ALERT_KEY, new Date(nowMs).toISOString());
      }
    }

    return result;
  }

  return { runAvailabilityCheck, runPerformanceCheck };
}

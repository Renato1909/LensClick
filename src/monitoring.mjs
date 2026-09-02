const MONITOR_FAILURE_KEY = 'probe:consecutive_failures';
const MONITOR_LAST_ALERT_KEY = 'probe:last_alert_at';
const CONSECUTIVE_FAILURE_THRESHOLD = 2;
const COOLDOWN_MS = 60 * 60 * 1000;

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

async function sendAvailabilityAlert(env, { failures, windowMinutes, observedError, runbookUrl }) {
  if (!env.BREVO_API_KEY || !env.BREVO_SENDER_EMAIL) return false;
  const senderName = env.BREVO_SENDER_NAME || 'LensClick';
  const subject = '[LensClick] SLO: disponibilidade abaixo do limite';
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

  return { runAvailabilityCheck };
}

const SCHEMA_VERSION = 1;

const REQUEST_EVENT = 'http.request.completed';
const OPERATIONAL_EVENTS = new Set([
  'database.health_check.failed',
  'email.password_reset.delivery_failed',
  'email.verification.delivery_failed',
  'storage.profile_picture.cleanup_failed'
]);
const ERROR_CATEGORIES = new Set([
  'validation_error',
  'authentication_error',
  'database_error',
  'storage_error',
  'email_delivery_error',
  'unexpected_error'
]);
const HTTP_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
const STATIC_API_ROUTES = new Set([
  '/api/auth/register',
  '/api/auth/login',
  '/api/auth/password-reset/request',
  '/api/auth/password-reset/confirm',
  '/api/auth/email/verify',
  '/api/auth/email/resend',
  '/api/admin/overview',
  '/api/admin/reviews',
  '/api/admin/conversations',
  '/api/auth/logout',
  '/api/auth/me',
  '/api/health',
  '/api/photographers',
  '/api/account/portfolio',
  '/api/account/review-requests',
  '/api/account/conversations',
  '/api/account/professional-profile',
  '/api/profile',
  '/api/account/password',
  '/api/account/photo',
  '/api/account',
  '/api/contact',
  '/api/newsletter'
]);
const STATIC_HTML_ROUTES = new Set([
  '/index.html',
  '/cadastro.html',
  '/login.html',
  '/recuperar-senha.html',
  '/redefinir-senha.html',
  '/perfil.html',
  '/fotografo.html',
  '/busca.html',
  '/perfil_temp.html',
  '/privacidade.html',
  '/termos.html'
]);

function defaultClock() {
  return performance.now();
}

function defaultRequestIdFactory() {
  return crypto.randomUUID();
}

function defaultSink(level, event) {
  const logger = typeof console[level] === 'function' ? console[level] : console.log;
  logger.call(console, event);
}

function normalizeMethod(method) {
  const normalized = String(method || '').toUpperCase();
  return HTTP_METHODS.has(normalized) ? normalized : 'OTHER';
}

export function normalizeRoute(input) {
  let pathname;
  try {
    pathname = input instanceof URL ? input.pathname : new URL(String(input)).pathname;
  } catch {
    pathname = String(input || '').split('?')[0];
  }

  if (pathname === '/') return '/';
  if (STATIC_API_ROUTES.has(pathname)) return pathname;
  if (/^\/api\/photographers\/[^/]+\/photo$/.test(pathname)) return '/api/photographers/:slug/photo';
  if (/^\/api\/photographers\/[^/]+\/portfolio\/[^/]+$/.test(pathname)) return '/api/photographers/:slug/portfolio/:id';
  if (/^\/api\/photographers\/[^/]+\/reviews$/.test(pathname)) return '/api/photographers/:slug/reviews';
  if (/^\/api\/photographers\/[^/]+\/review-requests$/.test(pathname)) return '/api/photographers/:slug/review-requests';
  if (/^\/api\/photographers\/[^/]+\/conversations$/.test(pathname)) return '/api/photographers/:slug/conversations';
  if (/^\/api\/photographers\/[^/]+$/.test(pathname)) return '/api/photographers/:slug';
  if (/^\/api\/admin\/reviews\/[^/]+$/.test(pathname)) return '/api/admin/reviews/:id';
  if (/^\/api\/admin\/conversations\/[^/]+$/.test(pathname)) return '/api/admin/conversations/:id';
  if (/^\/api\/account\/review-requests\/[^/]+\/review$/.test(pathname)) return '/api/account/review-requests/:id/review';
  if (/^\/api\/account\/review-requests\/[^/]+$/.test(pathname)) return '/api/account/review-requests/:id';
  if (/^\/api\/account\/conversations\/[^/]+\/messages$/.test(pathname)) return '/api/account/conversations/:id/messages';
  if (/^\/api\/account\/conversations\/[^/]+\/read$/.test(pathname)) return '/api/account/conversations/:id/read';
  if (/^\/api\/account\/reviews\/[^/]+$/.test(pathname)) return '/api/account/reviews/:id';
  if (/^\/api\/account\/portfolio\/[^/]+\/image$/.test(pathname)) return '/api/account/portfolio/:id/image';
  if (/^\/api\/account\/portfolio\/[^/]+$/.test(pathname)) return '/api/account/portfolio/:id';
  if (/^\/api\/profile-picture\/[^/]+$/.test(pathname)) return '/api/profile-picture/:id';
  if (pathname.startsWith('/api/')) return '/api/unknown';
  if (pathname === '/sitemap.xml') return '/sitemap.xml';
  if (pathname === '/robots.txt') return '/robots.txt';
  if (/^\/fotografo\/[^/]+\/?$/.test(pathname)) return '/fotografo/:slug';
  if (STATIC_HTML_ROUTES.has(pathname)) return pathname;
  if (pathname.endsWith('.html')) return '/*.html';
  if (pathname.endsWith('.js')) return '/*.js';
  if (pathname.endsWith('.css')) return '/*.css';
  if (/\.(?:avif|gif|ico|jpe?g|png|svg|webp|woff2?)$/i.test(pathname)) return '/assets/*';
  return '/unknown';
}

export function classifyHttpStatus(status) {
  const normalized = Number.isInteger(Number(status)) ? Number(status) : 500;
  if (normalized < 400) return { level: 'info', outcome: 'success' };
  if (normalized < 500) return { level: 'warn', outcome: 'client_error' };
  return { level: 'error', outcome: 'server_error' };
}

export function errorCategoryForStatus(status) {
  const normalized = Number(status);
  if ([401, 403].includes(normalized)) return 'authentication_error';
  if (normalized >= 400 && normalized < 500) return 'validation_error';
  return 'unexpected_error';
}

export function createRequestContext(request, options = {}) {
  const clock = typeof options.clock === 'function' ? options.clock : defaultClock;
  const requestIdFactory = typeof options.requestIdFactory === 'function'
    ? options.requestIdFactory
    : defaultRequestIdFactory;
  const sink = typeof options.sink === 'function' ? options.sink : defaultSink;

  return Object.freeze({
    requestId: requestIdFactory(),
    method: normalizeMethod(request.method),
    route: normalizeRoute(request.url),
    startedAt: Number(clock()),
    clock,
    sink
  });
}

export function buildRequestCompletedEvent(context, status, options = {}) {
  const classification = classifyHttpStatus(status);
  const finishedAt = Number(context.clock());
  const duration = Number.isFinite(finishedAt - context.startedAt)
    ? Math.max(0, finishedAt - context.startedAt)
    : 0;
  const event = {
    schema_version: SCHEMA_VERSION,
    event: REQUEST_EVENT,
    level: classification.level,
    request_id: context.requestId,
    method: context.method,
    route: context.route,
    status: Number(status),
    outcome: classification.outcome,
    duration_ms: Math.round(duration * 1000) / 1000
  };
  if (ERROR_CATEGORIES.has(options.errorCategory)) event.error_category = options.errorCategory;
  return event;
}

export function buildOperationalErrorEvent(context, eventName, errorCategory) {
  if (!OPERATIONAL_EVENTS.has(eventName) || !ERROR_CATEGORIES.has(errorCategory)) return null;
  return {
    schema_version: SCHEMA_VERSION,
    event: eventName,
    level: 'error',
    request_id: context.requestId,
    error_category: errorCategory
  };
}

function emitStructuredEvent(context, event) {
  if (!event) return;
  try {
    const result = context.sink(event.level, event);
    if (result && typeof result.catch === 'function') result.catch(() => {});
  } catch {
    // Observability is best-effort and must never change the HTTP response.
  }
}

export function completeRequest(context, status, options = {}) {
  const event = buildRequestCompletedEvent(context, status, options);
  emitStructuredEvent(context, event);
  return event;
}

export function reportOperationalError(context, eventName, errorCategory) {
  const event = buildOperationalErrorEvent(context, eventName, errorCategory);
  emitStructuredEvent(context, event);
  return event;
}

export function responseWithRequestId(response, requestId) {
  const headers = new Headers(response.headers);
  headers.set('X-Request-ID', requestId);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

// Keep specific dynamic routes before generic ones so matching remains deterministic.
const API_ROUTES = Object.freeze([
  { id: 'health', method: 'GET', path: '/api/health' },
  { id: 'auth.register', method: 'POST', path: '/api/auth/register' },
  { id: 'auth.login', method: 'POST', path: '/api/auth/login' },
  { id: 'auth.password-reset.request', method: 'POST', path: '/api/auth/password-reset/request' },
  { id: 'auth.password-reset.confirm', method: 'POST', path: '/api/auth/password-reset/confirm' },
  { id: 'auth.logout', method: 'POST', path: '/api/auth/logout' },
  { id: 'auth.me', method: 'GET', path: '/api/auth/me' },
  { id: 'photographers.list', method: 'GET', path: '/api/photographers' },
  { id: 'photographers.photo', method: 'GET', pattern: /^\/api\/photographers\/([a-z0-9-]{3,80})\/photo$/ },
  { id: 'photographers.portfolio-image', method: 'GET', pattern: /^\/api\/photographers\/([a-z0-9-]{3,80})\/portfolio\/(\d+)$/ },
  { id: 'photographers.detail', method: 'GET', pattern: /^\/api\/photographers\/([a-z0-9-]{3,80})$/ },
  { id: 'account.portfolio.list', method: 'GET', path: '/api/account/portfolio' },
  { id: 'account.portfolio.create', method: 'POST', path: '/api/account/portfolio' },
  { id: 'account.portfolio.update', method: 'PUT', path: '/api/account/portfolio' },
  { id: 'account.portfolio.image', method: 'GET', pattern: /^\/api\/account\/portfolio\/(\d+)\/image$/ },
  { id: 'account.portfolio.delete', method: 'DELETE', pattern: /^\/api\/account\/portfolio\/(\d+)$/ },
  { id: 'account.professional-profile.read', method: 'GET', path: '/api/account/professional-profile' },
  { id: 'account.professional-profile.update', method: 'PUT', path: '/api/account/professional-profile' },
  { id: 'account.profile.update', method: 'PUT', path: '/api/profile' },
  { id: 'account.password.update', method: 'PUT', path: '/api/account/password' },
  { id: 'account.photo.delete', method: 'DELETE', path: '/api/account/photo' },
  { id: 'account.delete', method: 'DELETE', path: '/api/account' },
  { id: 'account.profile-picture', method: 'GET', pattern: /^\/api\/profile-picture\/(\d+)$/ },
  { id: 'contact.create', method: 'POST', path: '/api/contact' },
  { id: 'newsletter.create', method: 'POST', path: '/api/newsletter' }
]);

export function matchApiRoute(pathname, method) {
  const normalizedMethod = String(method || '').toUpperCase();
  for (const route of API_ROUTES) {
    if (route.method !== normalizedMethod) continue;
    if (route.path === pathname) return { id: route.id, params: [] };
    const match = route.pattern?.exec(pathname);
    if (match) return { id: route.id, params: match.slice(1) };
  }
  return null;
}

export function createRequestRouter({
  dispatchApiRoute,
  handleAssetRequest,
  requestOriginIsAllowed,
  forbiddenResponse,
  notFoundResponse
}) {
  async function handleApi(request, env, url, context, requestContext) {
    const method = request.method.toUpperCase();
    if (!['GET', 'HEAD'].includes(method) && !requestOriginIsAllowed(request)) {
      return forbiddenResponse();
    }

    const route = matchApiRoute(url.pathname, method);
    if (!route) return notFoundResponse();
    return dispatchApiRoute(route.id, route.params, request, env, url, context, requestContext);
  }

  async function handleRequest(request, env, context, requestContext) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      return handleApi(request, env, url, context, requestContext);
    }
    return handleAssetRequest(request, env);
  }

  return Object.freeze({ handleApi, handleRequest });
}

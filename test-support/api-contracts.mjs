export const API_CONTRACTS = Object.freeze([
  { area: 'auth', method: 'POST', route: '/api/auth/register' },
  { area: 'auth', method: 'POST', route: '/api/auth/login' },
  { area: 'auth', method: 'POST', route: '/api/auth/password-reset/request' },
  { area: 'auth', method: 'POST', route: '/api/auth/password-reset/confirm' },
  { area: 'auth', method: 'POST', route: '/api/auth/logout' },
  { area: 'auth', method: 'GET', route: '/api/auth/me' },
  { area: 'operations', method: 'GET', route: '/api/health' },
  { area: 'discovery', method: 'GET', route: '/api/photographers' },
  { area: 'discovery', method: 'GET', route: '/api/photographers/:slug' },
  { area: 'discovery', method: 'GET', route: '/api/photographers/:slug/photo' },
  { area: 'discovery', method: 'GET', route: '/api/photographers/:slug/portfolio/:id' },
  { area: 'portfolio', method: 'GET', route: '/api/account/portfolio' },
  { area: 'portfolio', method: 'POST', route: '/api/account/portfolio' },
  { area: 'portfolio', method: 'PUT', route: '/api/account/portfolio' },
  { area: 'portfolio', method: 'GET', route: '/api/account/portfolio/:id/image' },
  { area: 'portfolio', method: 'DELETE', route: '/api/account/portfolio/:id' },
  { area: 'professional-profile', method: 'GET', route: '/api/account/professional-profile' },
  { area: 'professional-profile', method: 'PUT', route: '/api/account/professional-profile' },
  { area: 'account', method: 'PUT', route: '/api/profile' },
  { area: 'account', method: 'PUT', route: '/api/account/password' },
  { area: 'account', method: 'DELETE', route: '/api/account/photo' },
  { area: 'account', method: 'DELETE', route: '/api/account' },
  { area: 'account', method: 'GET', route: '/api/profile-picture/:id' },
  { area: 'public-input', method: 'POST', route: '/api/contact' },
  { area: 'public-input', method: 'POST', route: '/api/newsletter' }
]);

export const AUTH_CONTRACTS = Object.freeze(API_CONTRACTS.filter(({ area }) => area === 'auth'));

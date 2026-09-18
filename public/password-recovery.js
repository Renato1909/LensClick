const form = document.getElementById('recoveryRequestForm');
const message = document.getElementById('recoveryMessage');
const button = form.querySelector('button[type="submit"]');
const UX = window.LensClickUX;

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  UX.showMessage(message, '', 'info');
  UX.setBusy(button, true, { pt: 'Enviando...', en: 'Sending...' });
  try {
    const { data } = await UX.apiFetch('/api/auth/password-reset/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: document.getElementById('recoveryEmail').value.trim(),
        language: document.documentElement.lang.startsWith('en') ? 'en' : 'pt'
      })
    }, UX.t('recovery.request.error'));
    UX.showMessage(message, UX.t('recovery.request.success'), 'success');
    form.reset();
  } catch (error) {
    const translatedError = error.status === 429
      ? UX.t('recovery.request.rateLimited')
      : error.status === 503
        ? UX.t('recovery.request.unavailable')
        : UX.t('recovery.request.error');
    UX.showMessage(message, translatedError, 'error');
  } finally {
    UX.setBusy(button, false);
  }
});

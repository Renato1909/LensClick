const form = document.getElementById('emailVerifyForm');
const message = document.getElementById('verifyMessage');
const resendButton = document.getElementById('resendButton');
const UX = window.LensClickUX;
const token = new URLSearchParams(window.location.search).get('token') || '';

function confirmTokenFormat(value) {
  return /^[A-Za-z0-9_-]{40,100}$/.test(value);
}

if (!confirmTokenFormat(token)) {
  form.hidden = true;
  UX.showMessage(message, UX.t('verify.invalidLink'), 'error');
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = form.querySelector('button[type="submit"]');
  UX.showMessage(message, '', 'info');
  UX.setBusy(button, true, { pt: 'Confirmando...', en: 'Confirming...' });
  try {
    await UX.apiFetch('/api/auth/email/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    }, UX.t('verify.error'));
    form.hidden = true;
    UX.showMessage(message, UX.t('verify.success'), 'success');
  } catch (error) {
    const translatedError = error.status === 429
      ? UX.t('verify.rateLimited')
      : error.status === 503
        ? UX.t('verify.unavailable')
        : UX.t('verify.invalidLink');
    UX.showMessage(message, translatedError, 'error');
    UX.setBusy(button, false);
  }
});

resendButton.addEventListener('click', async () => {
  UX.showMessage(message, '', 'info');
  UX.setBusy(resendButton, true, { pt: 'Enviando...', en: 'Sending...' });
  try {
    await UX.apiFetch('/api/auth/email/resend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    }, UX.t('verify.error'));
    UX.showMessage(message, UX.t('verify.resent'), 'success');
  } catch (error) {
    const translatedError = error.status === 401
      ? UX.t('verify.invalidLink')
      : error.status === 429
        ? UX.t('verify.rateLimited')
        : error.status === 503
          ? UX.t('verify.unavailable')
          : UX.t('verify.error');
    UX.showMessage(message, translatedError, 'error');
  } finally {
    UX.setBusy(resendButton, false);
  }
});

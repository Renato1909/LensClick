const form = document.getElementById('passwordResetForm');
const message = document.getElementById('resetMessage');
const button = form.querySelector('button[type="submit"]');
const passwordInput = document.getElementById('newPassword');
const confirmInput = document.getElementById('confirmPassword');
const UX = window.LensClickUX;
const token = new URLSearchParams(window.location.search).get('token') || '';

if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) {
  form.hidden = true;
  UX.showMessage(message, UX.t('recovery.confirm.invalidLink'), 'error');
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  confirmInput.setCustomValidity('');
  passwordInput.setCustomValidity('');
  if (!/^(?=.*\p{L})(?=.*\d).{8,}$/u.test(passwordInput.value)) {
    passwordInput.setCustomValidity(UX.t('recovery.confirm.passwordRules'));
    passwordInput.reportValidity();
    return;
  }
  if (passwordInput.value !== confirmInput.value) {
    confirmInput.setCustomValidity(UX.t('signup.passwordMismatch'));
    confirmInput.reportValidity();
    return;
  }
  UX.showMessage(message, '', 'info');
  UX.setBusy(button, true, { pt: 'Salvando...', en: 'Saving...' });
  try {
    await UX.apiFetch('/api/auth/password-reset/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password: passwordInput.value })
    }, UX.t('recovery.confirm.error'));
    form.hidden = true;
    UX.showMessage(message, UX.t('recovery.confirm.success'), 'success');
  } catch (error) {
    const translatedError = error.status === 429
      ? UX.t('recovery.confirm.rateLimited')
      : UX.t('recovery.confirm.invalidLink');
    UX.showMessage(message, translatedError, 'error');
    UX.setBusy(button, false);
  }
});

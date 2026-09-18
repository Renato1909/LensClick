const signupForm = document.getElementById('signupForm');
const signupMsg = document.getElementById('signupMsg');
const signupButton = signupForm.querySelector('button[type="submit"]');
const confirmPasswordInput = document.getElementById('signupConfirmPassword');
const UX = window.LensClickUX;

function showSignupMessage(message, type = 'error') {
  UX.showMessage(signupMsg, message, type);
}

confirmPasswordInput.addEventListener('input', () => confirmPasswordInput.setCustomValidity(''));

signupForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = document.getElementById('signupName').value.trim();
  const email = document.getElementById('signupEmail').value.trim();
  const phone = document.getElementById('signupPhone').value.trim();
  const password = document.getElementById('signupPassword').value;
  const confirmPassword = document.getElementById('signupConfirmPassword').value;
  if (password !== confirmPassword) {
    confirmPasswordInput.setCustomValidity(UX.t('signup.passwordMismatch'));
    confirmPasswordInput.reportValidity();
    confirmPasswordInput.focus();
    showSignupMessage(confirmPasswordInput.validationMessage);
    return;
  }

  showSignupMessage('', 'info');
  UX.setBusy(signupButton, true, { pt: 'Criando conta...', en: 'Creating account...' });
  try {
    await UX.apiFetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, phone, password })
    }, UX.t('signup.createError'));
    showSignupMessage(UX.t('signup.createdRedirect'), 'success');
    setTimeout(() => { window.location.href = 'perfil.html'; }, 700);
  } catch (error) {
    showSignupMessage(error.message);
    UX.setBusy(signupButton, false);
  }
});

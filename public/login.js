const loginForm = document.getElementById('loginForm');
const loginMsg = document.getElementById('loginMsg');
const loginButton = loginForm.querySelector('button[type="submit"]');
const UX = window.LensClickUX;

function showLoginMessage(message, type = 'error') {
  UX.showMessage(loginMsg, message, type);
}

const accountWasDeleted = new URLSearchParams(window.location.search).get('accountDeleted') === '1';
function showDeletedAccountMessage() {
  if (!accountWasDeleted) return;
  showLoginMessage(UX.t('login.accountDeleted'), 'success');
}
showDeletedAccountMessage();
document.addEventListener('translations.updated', showDeletedAccountMessage);
if (accountWasDeleted) window.history.replaceState({}, '', 'login.html');

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  showLoginMessage('', 'info');
  UX.setBusy(loginButton, true, { pt: 'Entrando...', en: 'Signing in...' });
  try {
    await UX.apiFetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    }, UX.t('login.error'));
    showLoginMessage(UX.t('login.secureRedirect'), 'success');
    setTimeout(() => { window.location.href = UX.safeNextDestination('perfil.html'); }, 700);
  } catch (error) {
    showLoginMessage(error.message);
    UX.setBusy(loginButton, false);
  }
});

(function () {
  const UX = window.LensClickUX;
  const profileForm = document.getElementById('profileForm');
  const passwordForm = document.getElementById('passwordForm');
  const profileImage = document.getElementById('profileImage');
  const avatarFallback = document.getElementById('avatarFallback');
  const picInput = document.getElementById('profilePic');
  const removePhotoButton = document.getElementById('removePhotoButton');
  const removePhotoDialog = document.getElementById('removePhotoDialog');
  const confirmRemovePhoto = document.getElementById('confirmRemovePhoto');
  const identityName = document.getElementById('identityName');
  const identityEmail = document.getElementById('identityEmail');
  const nameInput = document.getElementById('profileNameInput');
  const emailInput = document.getElementById('profileEmail');
  const phoneInput = document.getElementById('profilePhone');
  const roleInput = document.getElementById('profileRole');
  const ageInput = document.getElementById('profileAge');
  const genderInput = document.getElementById('profileGender');
  const emailPasswordGroup = document.getElementById('emailPasswordGroup');
  const emailCurrentPassword = document.getElementById('emailCurrentPassword');
  const saveButton = document.getElementById('saveProfile');
  const changePasswordButton = document.getElementById('changePasswordButton');
  const logoutButton = document.getElementById('logoutBtn');
  const profileMessage = document.getElementById('profileMsg');
  const passwordMessage = document.getElementById('passwordMsg');
  const currentPasswordInput = document.getElementById('currentPassword');
  const newPasswordInput = document.getElementById('newPassword');
  const confirmPasswordInput = document.getElementById('confirmPassword');

  let profilePicture = '';
  let originalEmail = '';

  function redirectToLogin() {
    window.location.replace('login.html?next=perfil.html');
  }

  function initials(name) {
    const parts = String(name || 'LensClick').trim().split(/\s+/).filter(Boolean);
    return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'LC';
  }

  function showProfilePicture(source) {
    profilePicture = source || '';
    profileImage.hidden = !profilePicture;
    avatarFallback.hidden = Boolean(profilePicture);
    removePhotoButton.hidden = !profilePicture;
    if (profilePicture) profileImage.src = profilePicture;
    else profileImage.removeAttribute('src');
  }

  function updateIdentity() {
    identityName.textContent = nameInput.value.trim() || 'LensClick';
    identityEmail.textContent = emailInput.value.trim();
    avatarFallback.textContent = initials(nameInput.value);
  }

  function updateEmailProtection() {
    const changed = emailInput.value.trim().toLowerCase() !== originalEmail;
    emailPasswordGroup.hidden = !changed;
    emailCurrentPassword.required = changed;
    if (!changed) emailCurrentPassword.value = '';
  }

  function populate(user) {
    nameInput.value = user.name || '';
    emailInput.value = user.email || '';
    phoneInput.value = user.phone || '';
    roleInput.value = user.role || 'client';
    ageInput.value = user.age ?? '';
    genderInput.value = user.gender || 'other';
    originalEmail = String(user.email || '').toLowerCase();
    emailCurrentPassword.value = '';
    updateEmailProtection();
    showProfilePicture(user.profilePic);
    updateIdentity();
  }

  async function loadProfile() {
    profileForm.setAttribute('aria-busy', 'true');
    passwordForm.setAttribute('aria-busy', 'true');
    UX.setBusy(saveButton, true, { pt: 'Carregando...', en: 'Loading...' });
    try {
      const { data } = await UX.apiFetch(
        '/api/auth/me',
        { headers: { Accept: 'application/json' } },
        UX.textByLanguage('Não foi possível carregar sua conta.', 'Could not load your account.')
      );
      populate(data.user);
    } catch (error) {
      if (error.status === 401) return redirectToLogin();
      UX.showMessage(profileMessage, error.message, 'error');
    } finally {
      profileForm.removeAttribute('aria-busy');
      passwordForm.removeAttribute('aria-busy');
      UX.setBusy(saveButton, false);
    }
  }

  picInput.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      UX.showMessage(profileMessage, UX.textByLanguage('Escolha uma imagem JPG, PNG ou WebP.', 'Choose a JPG, PNG or WebP image.'), 'error');
      picInput.value = '';
      return;
    }
    if (file.size > 450_000) {
      UX.showMessage(profileMessage, UX.textByLanguage('A imagem deve ter no máximo 450 KB.', 'The image must be no larger than 450 KB.'), 'error');
      picInput.value = '';
      return;
    }
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      showProfilePicture(String(reader.result || ''));
      UX.showMessage(profileMessage, UX.textByLanguage('Foto pronta. Salve as alterações para confirmar.', 'Photo ready. Save your changes to confirm.'), 'info');
    });
    reader.readAsDataURL(file);
  });

  nameInput.addEventListener('input', updateIdentity);
  emailInput.addEventListener('input', () => {
    updateIdentity();
    updateEmailProtection();
  });

  profileForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!profileForm.reportValidity()) return;
    UX.setBusy(saveButton, true, { pt: 'Salvando...', en: 'Saving...' });
    UX.showMessage(profileMessage, '');
    try {
      const { data } = await UX.apiFetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nameInput.value.trim(),
          email: emailInput.value.trim(),
          phone: phoneInput.value.trim(),
          role: roleInput.value,
          age: ageInput.value,
          gender: genderInput.value,
          profilePic: profilePicture,
          currentPassword: emailCurrentPassword.value
        })
      }, UX.textByLanguage('Não foi possível salvar os dados.', 'Could not save your details.'));
      populate(data.user);
      picInput.value = '';
      UX.showMessage(profileMessage, UX.textByLanguage('Alterações salvas com segurança.', 'Changes saved securely.'), 'success');
    } catch (error) {
      if (error.status === 401) return redirectToLogin();
      UX.showMessage(profileMessage, error.message, 'error');
      if (error.status === 403) emailCurrentPassword.focus();
    } finally {
      UX.setBusy(saveButton, false);
    }
  });

  function validatePasswordConfirmation() {
    const message = newPasswordInput.value === confirmPasswordInput.value
      ? ''
      : UX.textByLanguage('As senhas não coincidem.', 'Passwords do not match.');
    confirmPasswordInput.setCustomValidity(message);
  }

  newPasswordInput.addEventListener('input', validatePasswordConfirmation);
  confirmPasswordInput.addEventListener('input', validatePasswordConfirmation);

  passwordForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    validatePasswordConfirmation();
    if (!passwordForm.reportValidity()) return;
    UX.setBusy(changePasswordButton, true, { pt: 'Atualizando...', en: 'Updating...' });
    UX.showMessage(passwordMessage, '');
    try {
      await UX.apiFetch('/api/account/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: currentPasswordInput.value,
          newPassword: newPasswordInput.value
        })
      }, UX.textByLanguage('Não foi possível atualizar a senha.', 'Could not update your password.'));
      passwordForm.reset();
      UX.showMessage(passwordMessage, UX.textByLanguage('Senha atualizada. As outras sessões foram encerradas.', 'Password updated. Other sessions were signed out.'), 'success');
    } catch (error) {
      if (error.status === 401) return redirectToLogin();
      UX.showMessage(passwordMessage, error.message, 'error');
      if (error.status === 403) currentPasswordInput.focus();
    } finally {
      UX.setBusy(changePasswordButton, false);
    }
  });

  removePhotoButton.addEventListener('click', () => removePhotoDialog.showModal());
  removePhotoDialog.addEventListener('close', async () => {
    if (removePhotoDialog.returnValue !== 'confirm') return;
    UX.setBusy(removePhotoButton, true, { pt: 'Removendo...', en: 'Removing...' });
    UX.setBusy(confirmRemovePhoto, true, { pt: 'Removendo...', en: 'Removing...' });
    try {
      const { data } = await UX.apiFetch('/api/account/photo', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
      }, UX.textByLanguage('Não foi possível remover a foto.', 'Could not remove the photo.'));
      populate(data.user);
      picInput.value = '';
      UX.showMessage(profileMessage, UX.textByLanguage('Foto removida permanentemente.', 'Photo permanently removed.'), 'success');
    } catch (error) {
      if (error.status === 401) return redirectToLogin();
      UX.showMessage(profileMessage, error.message, 'error');
    } finally {
      UX.setBusy(removePhotoButton, false);
      UX.setBusy(confirmRemovePhoto, false);
    }
  });

  logoutButton.addEventListener('click', async () => {
    UX.setBusy(logoutButton, true, { pt: 'Saindo...', en: 'Signing out...' });
    try {
      await UX.apiFetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
      }, UX.textByLanguage('Não foi possível encerrar a sessão.', 'Could not sign out.'));
      window.location.replace('login.html');
    } catch (error) {
      UX.showMessage(profileMessage, error.message, 'error');
      UX.setBusy(logoutButton, false);
    }
  });

  loadProfile();
})();

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
  const deleteAccountButton = document.getElementById('deleteAccountButton');
  const deleteAccountDialog = document.getElementById('deleteAccountDialog');
  const deleteAccountForm = document.getElementById('deleteAccountForm');
  const deleteCurrentPassword = document.getElementById('deleteCurrentPassword');
  const deleteConfirmation = document.getElementById('deleteConfirmation');
  const deleteConfirmationPhrase = document.getElementById('deleteConfirmationPhrase');
  const deleteAccountMessage = document.getElementById('deleteAccountMsg');
  const cancelDeleteAccount = document.getElementById('cancelDeleteAccount');
  const confirmDeleteAccount = document.getElementById('confirmDeleteAccount');
  const professionalSection = document.getElementById('professionalSection');
  const professionalForm = document.getElementById('professionalForm');
  const professionalBio = document.getElementById('professionalBio');
  const professionalBioCount = document.getElementById('professionalBioCount');
  const professionalCity = document.getElementById('professionalCity');
  const professionalState = document.getElementById('professionalState');
  const professionalRadius = document.getElementById('professionalRadius');
  const professionalPrice = document.getElementById('professionalPrice');
  const professionalAvailability = document.getElementById('professionalAvailability');
  const professionalEmail = document.getElementById('professionalEmail');
  const professionalPhone = document.getElementById('professionalPhone');
  const professionalInstagram = document.getElementById('professionalInstagram');
  const professionalWebsite = document.getElementById('professionalWebsite');
  const professionalShowEmail = document.getElementById('professionalShowEmail');
  const professionalShowPhone = document.getElementById('professionalShowPhone');
  const professionalPublished = document.getElementById('professionalPublished');
  const professionalUrlBox = document.getElementById('professionalUrlBox');
  const professionalPublicLink = document.getElementById('professionalPublicLink');
  const professionalMessage = document.getElementById('professionalMsg');
  const saveProfessionalProfile = document.getElementById('saveProfessionalProfile');
  const specialtyInputs = [...document.querySelectorAll('input[name="specialties"]')];

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

  function updateBioCount() {
    professionalBioCount.textContent = `${professionalBio.value.length}/1200`;
  }

  function updateProfessionalLink(profile) {
    const visible = Boolean(profile?.isPublished && profile.slug);
    professionalUrlBox.hidden = !visible;
    if (!visible) {
      professionalPublicLink.removeAttribute('href');
      professionalPublicLink.textContent = '';
      return;
    }
    const relativeUrl = `fotografo.html?perfil=${encodeURIComponent(profile.slug)}`;
    professionalPublicLink.href = relativeUrl;
    professionalPublicLink.textContent = new URL(relativeUrl, window.location.href).toString();
  }

  function populateProfessional(profile) {
    professionalBio.value = profile.bio || '';
    professionalCity.value = profile.city || '';
    professionalState.value = profile.state || '';
    professionalRadius.value = profile.serviceRadiusKm ?? '';
    professionalPrice.value = profile.startingPriceCents == null ? '' : (profile.startingPriceCents / 100).toFixed(2);
    professionalAvailability.value = profile.availability || 'available';
    professionalEmail.value = profile.publicEmail || '';
    professionalPhone.value = profile.publicPhone || '';
    professionalInstagram.value = profile.instagram || '';
    professionalWebsite.value = profile.website || '';
    professionalShowEmail.checked = Boolean(profile.showEmail);
    professionalShowPhone.checked = Boolean(profile.showPhone);
    professionalPublished.checked = Boolean(profile.isPublished);
    const selected = new Set(profile.specialties || []);
    specialtyInputs.forEach((input) => { input.checked = selected.has(input.value); });
    updateBioCount();
    updateProfessionalLink(profile);
  }

  async function loadProfessionalProfile() {
    professionalSection.hidden = roleInput.value !== 'photographer';
    if (professionalSection.hidden) return;
    professionalForm.setAttribute('aria-busy', 'true');
    saveProfessionalProfile.disabled = true;
    try {
      const { data } = await UX.apiFetch(
        '/api/account/professional-profile',
        { headers: { Accept: 'application/json' } },
        UX.textByLanguage('Não foi possível carregar o perfil profissional.', 'Could not load the professional profile.')
      );
      populateProfessional(data.profile);
    } catch (error) {
      if (error.status === 401) return redirectToLogin();
      UX.showMessage(professionalMessage, error.message, 'error');
    } finally {
      professionalForm.removeAttribute('aria-busy');
      saveProfessionalProfile.disabled = false;
    }
  }

  async function loadProfile() {
    profileForm.setAttribute('aria-busy', 'true');
    passwordForm.setAttribute('aria-busy', 'true');
    saveButton.disabled = true;
    try {
      const { data } = await UX.apiFetch(
        '/api/auth/me',
        { headers: { Accept: 'application/json' } },
        UX.textByLanguage('Não foi possível carregar sua conta.', 'Could not load your account.')
      );
      populate(data.user);
      await loadProfessionalProfile();
    } catch (error) {
      if (error.status === 401) return redirectToLogin();
      UX.showMessage(profileMessage, error.message, 'error');
    } finally {
      profileForm.removeAttribute('aria-busy');
      passwordForm.removeAttribute('aria-busy');
      saveButton.disabled = false;
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

  professionalBio.addEventListener('input', updateBioCount);
  professionalState.addEventListener('input', () => {
    professionalState.value = professionalState.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
  });
  specialtyInputs.forEach((input) => {
    input.addEventListener('change', () => {
      const selectedCount = specialtyInputs.filter((item) => item.checked).length;
      if (selectedCount > 6) {
        input.checked = false;
        UX.showMessage(professionalMessage, UX.textByLanguage('Escolha no máximo seis especialidades.', 'Choose up to six specialties.'), 'error');
      }
    });
  });

  professionalForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!professionalForm.reportValidity()) return;
    const selectedSpecialties = specialtyInputs.filter((input) => input.checked).map((input) => input.value);
    const priceValue = professionalPrice.value === '' ? null : Math.round(Number(professionalPrice.value) * 100);
    UX.setBusy(saveProfessionalProfile, true, { pt: 'Salvando...', en: 'Saving...' });
    UX.showMessage(professionalMessage, '');
    try {
      const { data } = await UX.apiFetch('/api/account/professional-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bio: professionalBio.value.trim(),
          specialties: selectedSpecialties,
          city: professionalCity.value.trim(),
          state: professionalState.value.trim(),
          serviceRadiusKm: professionalRadius.value,
          startingPriceCents: priceValue,
          availability: professionalAvailability.value,
          publicEmail: professionalEmail.value.trim(),
          publicPhone: professionalPhone.value.trim(),
          instagram: professionalInstagram.value.trim(),
          website: professionalWebsite.value.trim(),
          showEmail: professionalShowEmail.checked,
          showPhone: professionalShowPhone.checked,
          isPublished: professionalPublished.checked
        })
      }, UX.textByLanguage('Não foi possível salvar o perfil profissional.', 'Could not save the professional profile.'));
      populateProfessional(data.profile);
      UX.showMessage(professionalMessage, UX.textByLanguage(
        data.profile.isPublished ? 'Perfil profissional publicado com sucesso.' : 'Rascunho profissional salvo com sucesso.',
        data.profile.isPublished ? 'Professional profile published successfully.' : 'Professional draft saved successfully.'
      ), 'success');
    } catch (error) {
      if (error.status === 401) return redirectToLogin();
      UX.showMessage(professionalMessage, error.message, 'error');
      if (error.status === 400 && professionalPublished.checked) professionalPublished.focus();
    } finally {
      UX.setBusy(saveProfessionalProfile, false);
    }
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
      await loadProfessionalProfile();
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

  function expectedDeletionPhrase() {
    return UX.isEnglish() ? 'DELETE' : 'EXCLUIR';
  }

  function validateDeletionConfirmation() {
    const phrase = expectedDeletionPhrase();
    deleteConfirmationPhrase.textContent = phrase;
    deleteConfirmation.placeholder = phrase;
    const matches = deleteConfirmation.value.trim().toUpperCase() === phrase;
    confirmDeleteAccount.disabled = !matches || deleteCurrentPassword.value.length < 8;
    deleteConfirmation.setCustomValidity(
      deleteConfirmation.value && !matches
        ? UX.textByLanguage('Digite EXCLUIR exatamente como indicado.', 'Type DELETE exactly as shown.')
        : ''
    );
  }

  deleteAccountButton.addEventListener('click', () => {
    deleteAccountForm.reset();
    UX.showMessage(deleteAccountMessage, '');
    validateDeletionConfirmation();
    deleteAccountDialog.showModal();
    deleteCurrentPassword.focus();
  });

  deleteConfirmation.addEventListener('input', validateDeletionConfirmation);
  deleteCurrentPassword.addEventListener('input', validateDeletionConfirmation);
  document.addEventListener('translations.updated', validateDeletionConfirmation);
  cancelDeleteAccount.addEventListener('click', () => deleteAccountDialog.close('cancel'));

  deleteAccountForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    validateDeletionConfirmation();
    if (!deleteAccountForm.reportValidity() || confirmDeleteAccount.disabled) return;
    UX.setBusy(confirmDeleteAccount, true, { pt: 'Excluindo...', en: 'Deleting...' });
    UX.showMessage(deleteAccountMessage, '');
    try {
      await UX.apiFetch('/api/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: deleteCurrentPassword.value,
          confirmation: deleteConfirmation.value.trim()
        })
      }, UX.textByLanguage('Não foi possível excluir a conta.', 'Could not delete the account.'));
      window.location.replace('login.html?accountDeleted=1');
    } catch (error) {
      if (error.status === 401) return redirectToLogin();
      UX.showMessage(deleteAccountMessage, error.message, 'error');
      if (error.status === 403) deleteCurrentPassword.focus();
      UX.setBusy(confirmDeleteAccount, false);
      validateDeletionConfirmation();
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

(function () {
  const picPreview = document.querySelector('.avatar img');
  const noImageMessage = document.getElementById('noImageMessage');
  const picInput = document.getElementById('profilePic');
  const nameInput = document.getElementById('profileNameInput');
  const emailInput = document.getElementById('profileEmail');
  const phoneInput = document.getElementById('profilePhone');
  const roleInput = document.getElementById('profileRole');
  const ageInput = document.getElementById('profileAge');
  const genderInput = document.getElementById('profileGender');
  const saveButton = document.getElementById('saveProfile');
  const logoutButton = document.getElementById('logoutBtn');
  const message = document.getElementById('profileMsg');
  const form = document.getElementById('profileForm');
  const UX = window.LensClickUX;
  let profilePicture = '';

  function showMessage(text, type = 'success') {
    UX.showMessage(message, text, type);
  }

  function showProfilePicture(source) {
    profilePicture = source || '';
    if (profilePicture) {
      picPreview.src = profilePicture;
      picPreview.style.display = 'block';
      noImageMessage.style.display = 'none';
    } else {
      picPreview.removeAttribute('src');
      picPreview.style.display = 'none';
      noImageMessage.style.display = 'block';
    }
  }

  function populate(user) {
    nameInput.value = user.name || '';
    emailInput.value = user.email || '';
    phoneInput.value = user.phone || '';
    roleInput.value = user.role || 'client';
    ageInput.value = user.age ?? '';
    genderInput.value = user.gender || 'other';
    roleInput.dispatchEvent(new Event('change', { bubbles: true }));
    genderInput.dispatchEvent(new Event('change', { bubbles: true }));
    showProfilePicture(user.profilePic);
  }

  async function loadProfile() {
    form.setAttribute('aria-busy', 'true');
    UX.setBusy(saveButton, true, { pt: 'Carregando...', en: 'Loading...' });
    showMessage(UX.textByLanguage('Carregando perfil...', 'Loading profile...'), 'info');
    try {
      const { data } = await UX.apiFetch('/api/auth/me', { headers: { Accept: 'application/json' } }, UX.textByLanguage('Não foi possível carregar o perfil.', 'Could not load the profile.'));
      populate(data.user);
      showMessage('');
    } catch (error) {
      if (error.status === 401) {
        window.location.replace('login.html?next=perfil.html');
        return;
      }
      showMessage(error.message, 'error');
    } finally {
      form.removeAttribute('aria-busy');
      UX.setBusy(saveButton, false);
    }
  }

  picInput.addEventListener('change', (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      showMessage('Escolha uma imagem JPG, PNG ou WebP.', 'error');
      picInput.value = '';
      return;
    }
    if (file.size > 450_000) {
      showMessage('A imagem deve ter no máximo 450 KB.', 'error');
      picInput.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      showProfilePicture(String(reader.result || ''));
      showMessage('Imagem pronta. Clique em Salvar para confirmar.');
    };
    reader.readAsDataURL(file);
  });

  saveButton.addEventListener('click', async () => {
    if (!form.reportValidity()) return;
    UX.setBusy(saveButton, true, { pt: 'Salvando...', en: 'Saving...' });
    showMessage('');
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
          profilePic: profilePicture
        })
      }, UX.textByLanguage('Não foi possível salvar o perfil.', 'Could not save the profile.'));
      populate(data.user);
      showMessage(UX.textByLanguage('Perfil salvo com segurança.', 'Profile saved securely.'), 'success');
    } catch (error) {
      if (error.status === 401) {
        window.location.replace('login.html?next=perfil.html');
        return;
      }
      showMessage(error.message, 'error');
    } finally {
      UX.setBusy(saveButton, false);
    }
  });

  logoutButton.addEventListener('click', async () => {
    UX.setBusy(logoutButton, true, { pt: 'Saindo...', en: 'Signing out...' });
    try {
      await UX.apiFetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }, UX.textByLanguage('Não foi possível encerrar a sessão.', 'Could not sign out.'));
      window.location.replace('login.html');
    } catch (error) {
      showMessage(error.message, 'error');
      UX.setBusy(logoutButton, false);
    }
  });

  loadProfile();
})();

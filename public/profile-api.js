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
  const saveProfessionalProfileLabel = document.getElementById('saveProfessionalProfileLabel');
  const specialtyInputs = [...document.querySelectorAll('input[name="specialties"]')];
  const onboardingPanels = [...document.querySelectorAll('[data-onboarding-panel]')];
  const onboardingStepButtons = [...document.querySelectorAll('[data-onboarding-step]')];
  const onboardingBack = document.getElementById('onboardingBack');
  const onboardingNext = document.getElementById('onboardingNext');
  const onboardingProgress = document.querySelector('.onboarding-progress');
  const onboardingProgressBar = document.getElementById('onboardingProgressBar');
  const onboardingProgressValue = document.getElementById('onboardingProgressValue');
  const onboardingChecklist = document.getElementById('onboardingChecklist');
  const portfolioUploadForm = document.getElementById('portfolioUploadForm');
  const portfolioImage = document.getElementById('portfolioImage');
  const portfolioFileLabel = document.getElementById('portfolioFileLabel');
  const portfolioAltText = document.getElementById('portfolioAltText');
  const portfolioCaption = document.getElementById('portfolioCaption');
  const portfolioCategory = document.getElementById('portfolioCategory');
  const portfolioUploadButton = document.getElementById('portfolioUploadButton');
  const portfolioUploadMessage = document.getElementById('portfolioUploadMsg');
  const portfolioList = document.getElementById('portfolioList');
  const portfolioEmpty = document.getElementById('portfolioEmpty');
  const portfolioCount = document.getElementById('portfolioCount');
  const portfolioActions = document.getElementById('portfolioActions');
  const portfolioMessage = document.getElementById('portfolioMsg');
  const savePortfolioButton = document.getElementById('savePortfolioButton');

  let profilePicture = '';
  let originalEmail = '';
  let portfolioItems = [];
  let onboardingStep = 1;
  const ONBOARDING_STEP_KEY = 'lensclick.professionalOnboardingStep';

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
    updateOnboardingProgress();
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

  function selectedSpecialties() {
    return specialtyInputs.filter((input) => input.checked).map((input) => input.value);
  }

  function onboardingRequirements() {
    const publicEmailReady = professionalShowEmail.checked && professionalEmail.validity.valid && Boolean(professionalEmail.value.trim());
    const publicPhoneReady = professionalShowPhone.checked && professionalPhone.value.trim().length >= 8;
    const instagramReady = /^[A-Za-z0-9._]{1,30}$/.test(professionalInstagram.value.trim().replace(/^@/, ''));
    const websiteReady = professionalWebsite.validity.valid && Boolean(professionalWebsite.value.trim());
    return {
      photo: Boolean(profilePicture),
      identity: professionalBio.value.trim().length >= 60 && selectedSpecialties().length > 0,
      location: professionalCity.value.trim().length >= 2 && /^[A-Z]{2}$/.test(professionalState.value.trim()),
      contact: publicEmailReady || publicPhoneReady || instagramReady || websiteReady
    };
  }

  function updateOnboardingSaveLabel() {
    if (!saveProfessionalProfileLabel) return;
    saveProfessionalProfileLabel.textContent = professionalPublished.checked
      ? UX.t('profile.onboarding.saveAndPublish')
      : UX.t('profile.onboarding.saveDraft');
  }

  function updateOnboardingProgress() {
    if (!onboardingProgress) return;
    const requirements = onboardingRequirements();
    const completed = Object.values(requirements).filter(Boolean).length;
    const percentage = Math.round((completed / Object.keys(requirements).length) * 100);
    onboardingProgress.setAttribute('aria-valuenow', String(percentage));
    onboardingProgressBar.style.width = `${percentage}%`;
    onboardingProgressValue.textContent = `${percentage}%`;
    Object.entries(requirements).forEach(([name, isComplete]) => {
      const item = onboardingChecklist.querySelector(`[data-requirement="${name}"]`);
      if (item) item.dataset.complete = String(isComplete);
    });
    const stepCompletion = {
      1: requirements.identity,
      2: requirements.location,
      3: requirements.contact,
      4: Object.values(requirements).every(Boolean)
    };
    onboardingStepButtons.forEach((button) => {
      button.dataset.complete = String(stepCompletion[Number(button.dataset.onboardingStep)]);
    });
    updateOnboardingSaveLabel();
  }

  function rememberOnboardingStep(step) {
    try { window.sessionStorage.setItem(ONBOARDING_STEP_KEY, String(step)); } catch { /* Session continuity is optional. */ }
  }

  function showOnboardingStep(step, options = {}) {
    onboardingStep = Math.min(4, Math.max(1, Number(step) || 1));
    onboardingPanels.forEach((panel) => { panel.hidden = Number(panel.dataset.onboardingPanel) !== onboardingStep; });
    onboardingStepButtons.forEach((button) => {
      const active = Number(button.dataset.onboardingStep) === onboardingStep;
      if (active) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    });
    onboardingBack.hidden = onboardingStep === 1;
    onboardingNext.hidden = onboardingStep === 4;
    rememberOnboardingStep(onboardingStep);
    updateOnboardingProgress();
    if (options.focus) {
      const heading = document.querySelector(`[data-onboarding-panel="${onboardingStep}"] h3`);
      if (heading) {
        heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: true });
        heading.scrollIntoView({ behavior: UX.prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
      }
    }
  }

  function showOnboardingValidation(message, element) {
    UX.showMessage(professionalMessage, message, 'error');
    if (element) {
      element.setAttribute('aria-invalid', 'true');
      element.focus();
    }
  }

  function validateOnboardingStep(step) {
    const requirements = onboardingRequirements();
    if (step === 1 && !requirements.identity) {
      const missingBio = professionalBio.value.trim().length < 60;
      showOnboardingValidation(
        UX.t('profile.onboarding.validation.identity'),
        missingBio ? professionalBio : specialtyInputs[0]
      );
      return false;
    }
    if (step === 2 && !requirements.location) {
      const target = professionalCity.value.trim().length < 2 ? professionalCity : professionalState;
      showOnboardingValidation(
        UX.t('profile.onboarding.validation.location'),
        target
      );
      return false;
    }
    if (step === 3 && !requirements.contact) {
      showOnboardingValidation(
        UX.t('profile.onboarding.validation.contact'),
        professionalEmail
      );
      return false;
    }
    UX.showMessage(professionalMessage, '');
    return true;
  }

  function firstIncompleteOnboardingStep() {
    const requirements = onboardingRequirements();
    if (!requirements.identity) return 1;
    if (!requirements.location) return 2;
    if (!requirements.contact) return 3;
    return 4;
  }

  function updateProfessionalLink(profile) {
    const visible = Boolean(profile?.isPublished && profile.slug);
    professionalUrlBox.hidden = !visible;
    if (!visible) {
      professionalPublicLink.removeAttribute('href');
      professionalPublicLink.textContent = '';
      return;
    }
    const relativeUrl = `/fotografo/${encodeURIComponent(profile.slug)}`;
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
    updateOnboardingProgress();
  }

  function portfolioLabel(key, fallback = '') {
    return UX.t(key, {}, fallback);
  }

  function renderPortfolio() {
    portfolioList.replaceChildren();
    portfolioCount.textContent = `${portfolioItems.length}/12`;
    portfolioEmpty.hidden = portfolioItems.length > 0;
    portfolioActions.hidden = portfolioItems.length === 0;
    portfolioUploadButton.disabled = portfolioItems.length >= 12;
    portfolioItems.forEach((item, index) => {
      const card = document.createElement('article');
      card.className = 'portfolio-item';
      card.dataset.id = String(item.id);
      const image = document.createElement('img');
      image.srcset = [320, 640, 1280].map((width) => `${item.imageUrl}&width=${width} ${width}w`).join(', ');
      image.sizes = '(max-width: 720px) 100vw, 320px';
      image.src = `${item.imageUrl}&width=640`;
      image.alt = item.altText;

      const fields = document.createElement('div');
      fields.className = 'portfolio-item-fields';
      const altLabel = document.createElement('label');
      altLabel.textContent = portfolioLabel('profile.portfolio.alt');
      const altInput = document.createElement('input');
      altInput.type = 'text';
      altInput.maxLength = 160;
      altInput.required = true;
      altInput.value = item.altText;
      altInput.addEventListener('input', () => { item.altText = altInput.value; image.alt = altInput.value; });
      altLabel.append(altInput);
      const coverLabel = document.createElement('label');
      coverLabel.className = 'visibility-option';
      const coverInput = document.createElement('input');
      coverInput.type = 'checkbox';
      coverInput.checked = Boolean(item.isCover);
      coverInput.setAttribute('aria-label', portfolioLabel('profile.portfolio.cover'));
      coverInput.addEventListener('change', () => {
        portfolioItems.forEach((entry) => { entry.isCover = false; });
        item.isCover = coverInput.checked;
        renderPortfolio();
      });
      const coverText = document.createElement('span');
      coverText.textContent = portfolioLabel('profile.portfolio.cover');
      coverLabel.append(coverInput, coverText);
      const categoryLabel = document.createElement('label');
      categoryLabel.textContent = portfolioLabel('profile.portfolio.category');
      const categorySelect = document.createElement('select');
      [['other','portfolio.category.other'],['wedding','portfolio.category.wedding'],['events','portfolio.category.events'],['portrait','portfolio.category.portrait'],['family','portfolio.category.family'],['corporate','portfolio.category.corporate'],['product','portfolio.category.product'],['fashion','portfolio.category.fashion'],['newborn','portfolio.category.newborn'],['nature','portfolio.category.nature'],['real-estate','portfolio.category.realEstate']].forEach(([value,key]) => { const option=document.createElement('option'); option.value=value; option.textContent=portfolioLabel(key); categorySelect.append(option); });
      categorySelect.value = item.category || 'other';
      categorySelect.addEventListener('change', () => { item.category = categorySelect.value; });
      categoryLabel.append(categorySelect);
      const captionLabel = document.createElement('label');
      captionLabel.textContent = portfolioLabel('profile.portfolio.caption');
      const captionInput = document.createElement('input');
      captionInput.type = 'text';
      captionInput.maxLength = 240;
      captionInput.value = item.caption;
      captionInput.addEventListener('input', () => { item.caption = captionInput.value; });
      captionLabel.append(captionInput);
      fields.append(altLabel, captionLabel, categoryLabel, coverLabel);

      const controls = document.createElement('div');
      controls.className = 'portfolio-item-controls';
      const moveUp = document.createElement('button');
      moveUp.type = 'button';
      moveUp.disabled = index === 0;
      moveUp.setAttribute('aria-label', portfolioLabel('profile.portfolio.moveUp'));
      const upIcon = document.createElement('i');
      upIcon.className = 'fa-solid fa-arrow-up';
      upIcon.setAttribute('aria-hidden', 'true');
      moveUp.append(upIcon);
      moveUp.addEventListener('click', () => {
        [portfolioItems[index - 1], portfolioItems[index]] = [portfolioItems[index], portfolioItems[index - 1]];
        renderPortfolio();
      });
      const moveDown = document.createElement('button');
      moveDown.type = 'button';
      moveDown.disabled = index === portfolioItems.length - 1;
      moveDown.setAttribute('aria-label', portfolioLabel('profile.portfolio.moveDown'));
      const downIcon = document.createElement('i');
      downIcon.className = 'fa-solid fa-arrow-down';
      downIcon.setAttribute('aria-hidden', 'true');
      moveDown.append(downIcon);
      moveDown.addEventListener('click', () => {
        [portfolioItems[index + 1], portfolioItems[index]] = [portfolioItems[index], portfolioItems[index + 1]];
        renderPortfolio();
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'portfolio-remove';
      remove.setAttribute('aria-label', portfolioLabel('profile.portfolio.delete'));
      const removeIcon = document.createElement('i');
      removeIcon.className = 'fa-regular fa-trash-can';
      removeIcon.setAttribute('aria-hidden', 'true');
      remove.append(removeIcon);
      remove.addEventListener('click', () => removePortfolioItem(item, remove));
      controls.append(moveUp, moveDown, remove);
      card.append(image, fields, controls);
      portfolioList.append(card);
    });
  }

  async function loadPortfolio() {
    const { data } = await UX.apiFetch('/api/account/portfolio', { headers: { Accept: 'application/json' } }, portfolioLabel('profile.portfolio.loadError'));
    portfolioItems = data.portfolio || [];
    renderPortfolio();
  }

  async function removePortfolioItem(item, button) {
    if (!window.confirm(portfolioLabel('profile.portfolio.deleteConfirm'))) return;
    UX.setBusy(button, true, { key: 'profile.portfolio.deleting' });
    try {
      await UX.apiFetch(`/api/account/portfolio/${item.id}`, { method: 'DELETE' }, portfolioLabel('profile.portfolio.deleteError'));
      portfolioItems = portfolioItems.filter((entry) => entry.id !== item.id);
      renderPortfolio();
      UX.showMessage(portfolioMessage, portfolioLabel('profile.portfolio.deleted'), 'success');
    } catch (error) {
      if (error.status === 401) return redirectToLogin();
      UX.showMessage(portfolioMessage, error.message, 'error');
      UX.setBusy(button, false);
    }
  }

  async function loadProfessionalProfile() {
    professionalSection.hidden = roleInput.value !== 'photographer';
    if (professionalSection.hidden) return;
    professionalForm.setAttribute('aria-busy', 'true');
    professionalForm.setAttribute('inert', '');
    saveProfessionalProfile.disabled = true;
    try {
      const { data } = await UX.apiFetch(
        '/api/account/professional-profile',
        { headers: { Accept: 'application/json' } },
        UX.t('profile.pro.loadError')
      );
      populateProfessional(data.profile);
      await loadPortfolio();
      let rememberedStep = 1;
      try { rememberedStep = Number(window.sessionStorage.getItem(ONBOARDING_STEP_KEY)) || 1; } catch { /* Start at the first step. */ }
      showOnboardingStep(rememberedStep);
    } catch (error) {
      if (error.status === 401) return redirectToLogin();
      UX.showMessage(professionalMessage, error.message, 'error');
    } finally {
      professionalForm.removeAttribute('aria-busy');
      professionalForm.removeAttribute('inert');
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
        UX.t('profile.loadError')
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
      UX.showMessage(profileMessage, UX.t('profile.photo.invalidType'), 'error');
      picInput.value = '';
      return;
    }
    if (file.size > 450_000) {
      UX.showMessage(profileMessage, UX.t('profile.photo.maxSize'), 'error');
      picInput.value = '';
      return;
    }
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      showProfilePicture(String(reader.result || ''));
      UX.showMessage(profileMessage, UX.t('profile.photo.ready'), 'info');
    });
    reader.readAsDataURL(file);
  });

  nameInput.addEventListener('input', updateIdentity);
  emailInput.addEventListener('input', () => {
    updateIdentity();
    updateEmailProtection();
  });

  professionalBio.addEventListener('input', () => {
    professionalBio.removeAttribute('aria-invalid');
    updateBioCount();
    updateOnboardingProgress();
  });
  professionalState.addEventListener('input', () => {
    professionalState.removeAttribute('aria-invalid');
    professionalState.value = professionalState.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
    updateOnboardingProgress();
  });
  specialtyInputs.forEach((input) => {
    input.addEventListener('change', () => {
      specialtyInputs.forEach((item) => item.removeAttribute('aria-invalid'));
      const selectedCount = specialtyInputs.filter((item) => item.checked).length;
      if (selectedCount > 6) {
        input.checked = false;
        UX.showMessage(professionalMessage, UX.t('profile.pro.maxSpecialties'), 'error');
      }
      updateOnboardingProgress();
    });
  });

  [professionalCity, professionalEmail, professionalPhone, professionalInstagram, professionalWebsite].forEach((input) => {
    input.addEventListener('input', () => {
      input.removeAttribute('aria-invalid');
      updateOnboardingProgress();
    });
  });
  [professionalShowEmail, professionalShowPhone].forEach((input) => {
    input.addEventListener('change', updateOnboardingProgress);
  });

  onboardingStepButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const targetStep = Number(button.dataset.onboardingStep);
      if (targetStep > onboardingStep && !validateOnboardingStep(onboardingStep)) return;
      showOnboardingStep(targetStep, { focus: true });
    });
  });
  onboardingBack.addEventListener('click', () => showOnboardingStep(onboardingStep - 1, { focus: true }));
  onboardingNext.addEventListener('click', () => {
    if (!validateOnboardingStep(onboardingStep)) return;
    showOnboardingStep(onboardingStep + 1, { focus: true });
  });
  professionalPublished.addEventListener('change', () => {
    if (professionalPublished.checked && !Object.values(onboardingRequirements()).every(Boolean)) {
      professionalPublished.checked = false;
      showOnboardingStep(firstIncompleteOnboardingStep(), { focus: true });
      UX.showMessage(professionalMessage, UX.t('profile.onboarding.publishRequirements'), 'info');
    }
    updateOnboardingProgress();
  });
  document.addEventListener('translations.updated', updateOnboardingSaveLabel);

  portfolioImage.addEventListener('change', () => {
    const file = portfolioImage.files?.[0];
    portfolioFileLabel.textContent = file?.name || portfolioLabel('profile.portfolio.choose');
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 4_000_000) {
      UX.showMessage(portfolioUploadMessage, portfolioLabel('profile.portfolio.invalidFile'), 'error');
      portfolioImage.value = '';
      portfolioFileLabel.textContent = portfolioLabel('profile.portfolio.choose');
    }
  });

  portfolioUploadForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!portfolioUploadForm.reportValidity()) return;
    const file = portfolioImage.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('image', file);
    formData.append('altText', portfolioAltText.value.trim());
    formData.append('caption', portfolioCaption.value.trim());
    formData.append('category', portfolioCategory.value);
    UX.setBusy(portfolioUploadButton, true, { pt: 'Enviando...', en: 'Uploading...' });
    UX.showMessage(portfolioUploadMessage, '');
    try {
      const { data } = await UX.apiFetch('/api/account/portfolio', { method: 'POST', body: formData }, portfolioLabel('profile.portfolio.uploadError'));
      portfolioItems.push(data.item);
      portfolioUploadForm.reset();
      portfolioFileLabel.textContent = portfolioLabel('profile.portfolio.choose');
      renderPortfolio();
      UX.showMessage(portfolioUploadMessage, portfolioLabel('profile.portfolio.added'), 'success');
    } catch (error) {
      if (error.status === 401) return redirectToLogin();
      UX.showMessage(portfolioUploadMessage, error.message, 'error');
    } finally {
      UX.setBusy(portfolioUploadButton, false);
      portfolioUploadButton.disabled = portfolioItems.length >= 12;
    }
  });

  savePortfolioButton.addEventListener('click', async () => {
    if (portfolioItems.some((item) => item.altText.trim().length < 3)) {
      UX.showMessage(portfolioMessage, portfolioLabel('profile.portfolio.describeAll'), 'error');
      return;
    }
    UX.setBusy(savePortfolioButton, true, { pt: 'Salvando...', en: 'Saving...' });
    UX.showMessage(portfolioMessage, '');
    try {
      const { data } = await UX.apiFetch('/api/account/portfolio', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: portfolioItems.map(({ id, caption, altText, category, isCover }) => ({ id, caption, altText, category, isCover: Boolean(isCover) })) })
      }, portfolioLabel('profile.portfolio.saveError'));
      portfolioItems = data.portfolio;
      renderPortfolio();
      UX.showMessage(portfolioMessage, portfolioLabel('profile.portfolio.saved'), 'success');
    } catch (error) {
      if (error.status === 401) return redirectToLogin();
      UX.showMessage(portfolioMessage, error.message, 'error');
    } finally {
      UX.setBusy(savePortfolioButton, false);
    }
  });

  professionalForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!professionalForm.reportValidity()) return;
    if (professionalPublished.checked && !Object.values(onboardingRequirements()).every(Boolean)) {
      showOnboardingStep(firstIncompleteOnboardingStep(), { focus: true });
      UX.showMessage(professionalMessage, UX.t('profile.onboarding.publishRequirementsError'), 'error');
      return;
    }
    const selectedSpecialtyValues = selectedSpecialties();
    const priceValue = professionalPrice.value === '' ? null : Math.round(Number(professionalPrice.value) * 100);
    UX.setBusy(saveProfessionalProfile, true, { pt: 'Salvando...', en: 'Saving...' });
    UX.showMessage(professionalMessage, '');
    try {
      const { data } = await UX.apiFetch('/api/account/professional-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bio: professionalBio.value.trim(),
          specialties: selectedSpecialtyValues,
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
      }, UX.t('profile.pro.saveError'));
      populateProfessional(data.profile);
      UX.showMessage(professionalMessage, UX.t(
        data.profile.isPublished ? 'profile.pro.published' : 'profile.pro.draftSaved'
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
      }, UX.t('profile.updateError'));
      populate(data.user);
      await loadProfessionalProfile();
      picInput.value = '';
      UX.showMessage(profileMessage, UX.t('profile.updated'), 'success');
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
      : UX.t('profile.password.mismatch');
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
      }, UX.t('profile.password.error'));
      passwordForm.reset();
      UX.showMessage(passwordMessage, UX.t('profile.password.success'), 'success');
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
      }, UX.t('profile.photo.removeError'));
      populate(data.user);
      picInput.value = '';
      UX.showMessage(profileMessage, UX.t('profile.photo.removed'), 'success');
    } catch (error) {
      if (error.status === 401) return redirectToLogin();
      UX.showMessage(profileMessage, error.message, 'error');
    } finally {
      UX.setBusy(removePhotoButton, false);
      UX.setBusy(confirmRemovePhoto, false);
    }
  });

  function expectedDeletionPhrase() {
    return UX.t('profile.delete.phrase');
  }

  function validateDeletionConfirmation() {
    const phrase = expectedDeletionPhrase();
    deleteConfirmationPhrase.textContent = phrase;
    deleteConfirmation.placeholder = phrase;
    const matches = deleteConfirmation.value.trim().toUpperCase() === phrase;
    confirmDeleteAccount.disabled = !matches || deleteCurrentPassword.value.length < 8;
    deleteConfirmation.setCustomValidity(
      deleteConfirmation.value && !matches
        ? UX.t('profile.delete.invalidPhrase')
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
  document.addEventListener('translations.updated', () => {
    validateDeletionConfirmation();
    if (portfolioItems.length) renderPortfolio();
    if (!portfolioImage.files?.length) portfolioFileLabel.textContent = portfolioLabel('profile.portfolio.choose');
  });
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
      }, UX.t('profile.delete.error'));
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
      }, UX.t('profile.logout.error'));
      window.location.replace('login.html');
    } catch (error) {
      UX.showMessage(profileMessage, error.message, 'error');
      UX.setBusy(logoutButton, false);
    }
  });

  loadProfile();
})();

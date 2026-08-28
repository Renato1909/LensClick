(function () {
  const UX = window.LensClickUX;
  const loading = document.getElementById('profileLoading');
  const errorSection = document.getElementById('profileError');
  const profileArticle = document.getElementById('professionalProfile');
  const nameElement = document.getElementById('photographerName');
  const locationElement = document.getElementById('photographerLocation');
  const availabilityElement = document.getElementById('photographerAvailability');
  const imageElement = document.getElementById('photographerImage');
  const initialsElement = document.getElementById('photographerInitials');
  const bioElement = document.getElementById('photographerBio');
  const specialtiesElement = document.getElementById('photographerSpecialties');
  const priceRow = document.getElementById('priceRow');
  const priceElement = document.getElementById('photographerPrice');
  const radiusRow = document.getElementById('radiusRow');
  const radiusElement = document.getElementById('photographerRadius');
  const contactsElement = document.getElementById('photographerContacts');
  const portfolioSection = document.getElementById('portfolioSection');
  const portfolioElement = document.getElementById('photographerPortfolio');
  const portfolioImageUnavailableLabel = document.getElementById('portfolioImageUnavailableLabel');
  let currentProfile = null;

  const specialtyKeys = {
    wedding: 'wedding', events: 'events', portrait: 'portrait', family: 'family',
    corporate: 'corporate', product: 'product', fashion: 'fashion', newborn: 'newborn',
    nature: 'nature', 'real-estate': 'realEstate'
  };

  function initials(name) {
    return String(name || 'LensClick').trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  }

  function addContact(icon, label, href) {
    const link = document.createElement('a');
    link.href = href;
    const iconElement = document.createElement('i');
    iconElement.className = icon;
    iconElement.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span');
    text.textContent = label;
    link.append(iconElement, text);
    if (href.startsWith('http')) {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
    contactsElement.append(link);
  }

  function responsiveImageSources(imageUrl) {
    return `${imageUrl} 1200w`;
  }

  function renderPortfolioItem(item, index) {
    const figure = document.createElement('figure');
    figure.className = 'portfolio-figure is-loading';
    figure.setAttribute('role', 'listitem');
    figure.dataset.errorLabel = portfolioImageUnavailableLabel.textContent;

    const image = document.createElement('img');
    image.className = 'portfolio-image';
    image.alt = item.altText;
    image.width = index === 0 ? 1600 : 1200;
    image.height = 900;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.sizes = index === 0
      ? '(max-width: 520px) calc(100vw - 68px), (max-width: 760px) calc(100vw - 98px), 660px'
      : '(max-width: 520px) calc(100vw - 68px), (max-width: 760px) calc((100vw - 110px) / 2), 324px';
    image.srcset = responsiveImageSources(item.imageUrl);
    image.addEventListener('load', () => figure.classList.replace('is-loading', 'is-loaded'), { once: true });
    image.addEventListener('error', () => figure.classList.replace('is-loading', 'is-unavailable'), { once: true });
    image.src = item.imageUrl;
    figure.append(image);

    if (item.caption) {
      const caption = document.createElement('figcaption');
      caption.textContent = item.caption;
      figure.append(caption);
    }

    return figure;
  }

  function render(profile) {
    currentProfile = profile;
    nameElement.textContent = profile.name;
    locationElement.textContent = `${profile.city}, ${profile.state}`;
    bioElement.textContent = profile.bio;
    initialsElement.textContent = initials(profile.name);
    imageElement.hidden = !profile.profilePic;
    initialsElement.hidden = Boolean(profile.profilePic);
    if (profile.profilePic) {
      imageElement.src = profile.profilePic;
      imageElement.alt = UX.t('photographer.portraitAlt', { name: profile.name }, `Retrato de ${profile.name}`);
    }

    availabilityElement.dataset.status = profile.availability;
    availabilityElement.textContent = UX.t(`availability.${profile.availability || 'available'}`);

    specialtiesElement.replaceChildren();
    profile.specialties.forEach((specialty) => {
      const badge = document.createElement('span');
      const key = specialtyKeys[specialty];
      badge.textContent = key ? UX.t(`specialty.${key}`, {}, specialty) : specialty;
      specialtiesElement.append(badge);
    });

    portfolioElement.replaceChildren();
    const portfolio = Array.isArray(profile.portfolio) ? profile.portfolio : [];
    portfolioSection.hidden = portfolio.length === 0;
    portfolio.forEach((item, index) => portfolioElement.append(renderPortfolioItem(item, index)));

    priceRow.hidden = profile.startingPriceCents == null;
    if (!priceRow.hidden) {
      priceElement.textContent = new Intl.NumberFormat(window.i18n?.getLocale?.() || 'pt-BR', { style: 'currency', currency: 'BRL' }).format(profile.startingPriceCents / 100);
    }
    radiusRow.hidden = profile.serviceRadiusKm == null;
    if (!radiusRow.hidden) radiusElement.textContent = UX.t('photographer.radiusValue', { distance: profile.serviceRadiusKm }, `Até ${profile.serviceRadiusKm} km`);

    contactsElement.replaceChildren();
    if (profile.contacts.email) addContact('fa-regular fa-envelope', profile.contacts.email, `mailto:${profile.contacts.email}`);
    if (profile.contacts.phone) addContact('fa-solid fa-phone', profile.contacts.phone, `tel:${profile.contacts.phone.replace(/[^+\d]/g, '')}`);
    if (profile.instagram) addContact('fa-brands fa-instagram', `@${profile.instagram}`, `https://www.instagram.com/${encodeURIComponent(profile.instagram)}/`);
    if (profile.website) addContact('fa-solid fa-globe', UX.t('photographer.website', {}, 'Site profissional'), profile.website);
    document.title = `${profile.name} | LensClick`;
  }

  async function loadProfile() {
    const slug = new URLSearchParams(window.location.search).get('perfil') || '';
    if (!/^[a-z0-9-]{3,80}$/.test(slug)) {
      loading.hidden = true;
      errorSection.hidden = false;
      return;
    }
    try {
      const { data } = await UX.apiFetch(`/api/photographers/${encodeURIComponent(slug)}`, {
        headers: { Accept: 'application/json' }
      }, UX.t('photographer.errorTitle', {}, 'Este perfil não está disponível.'));
      render(data.profile);
      loading.hidden = true;
      profileArticle.hidden = false;
    } catch {
      loading.hidden = true;
      errorSection.hidden = false;
    }
  }

  document.addEventListener('translations.updated', () => { if (currentProfile) render(currentProfile); });
  Promise.resolve(window.i18n?.ready).then(loadProfile);
})();

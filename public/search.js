(function () {
  const UX = window.LensClickUX;
  const form = document.getElementById('searchForm');
  const stateInput = document.getElementById('filterState');
  const cityInput = document.getElementById('filterCity');
  const specialtyInput = document.getElementById('filterSpecialty');
  const availabilityInput = document.getElementById('filterAvailability');
  const minPriceInput = document.getElementById('filterMinPrice');
  const maxPriceInput = document.getElementById('filterMaxPrice');
  const minRadiusInput = document.getElementById('filterMinRadius');
  const sortInput = document.getElementById('filterSort');
  const clearFiltersBtn = document.getElementById('clearFilters');
  const resultsList = document.getElementById('resultsList');
  const resultsEmpty = document.getElementById('resultsEmpty');
  const pagination = document.getElementById('pagination');
  const prevPageBtn = document.getElementById('prevPage');
  const nextPageBtn = document.getElementById('nextPage');
  const pageInfo = document.getElementById('pageInfo');

  let page = 1;
  let pageSize = 12;
  let currentResults = [];
  let currentPagination = null;
  const specialtyKeys = {
    wedding: 'wedding', events: 'events', portrait: 'portrait', family: 'family',
    corporate: 'corporate', product: 'product', fashion: 'fashion', newborn: 'newborn',
    nature: 'nature', 'real-estate': 'realEstate'
  };

  function clearResults() {
    resultsList.replaceChildren();
    resultsEmpty.hidden = true;
    pagination.hidden = true;
  }

  function photographerCard(p) {
    const article = document.createElement('article');
    article.className = 'photographer-card';

    const link = document.createElement('a');
    link.href = `fotografo.html?perfil=${encodeURIComponent(p.slug)}`;
    link.className = 'photographer-link';

    const avatar = document.createElement('div');
    avatar.className = 'public-avatar small';
    const img = document.createElement('img');
    img.alt = '';
    img.hidden = !p.profilePic;
    if (p.profilePic) img.src = p.profilePic;
    const initials = document.createElement('span');
    initials.className = 'avatar-initials';
    initials.textContent = (p.name || 'LC').split(/\s+/).slice(0,2).map(s=>s[0]||'').join('').toUpperCase();
    avatar.append(img, initials);

    const info = document.createElement('div');
    info.className = 'photographer-info';
    const name = document.createElement('h3');
    name.textContent = p.name;
    const meta = document.createElement('p');
    meta.className = 'field-note';
    meta.textContent = `${p.city || ''}${p.city && p.state ? ', ' : ''}${p.state || ''}`;
    const details = document.createElement('p');
    details.className = 'search-card-details';
    const detailParts = [];
    if (p.startingPriceCents != null) {
      detailParts.push(new Intl.NumberFormat(window.i18n?.getLocale?.() || 'pt-BR', {
        style: 'currency', currency: 'BRL', maximumFractionDigits: 0
      }).format(p.startingPriceCents / 100));
    }
    if (p.serviceRadiusKm != null) detailParts.push(`${p.serviceRadiusKm} km`);
    details.textContent = detailParts.join(' · ');
    details.hidden = detailParts.length === 0;
    const specialties = document.createElement('div');
    specialties.className = 'public-specialties small';
    (p.specialties || []).slice(0,3).forEach(s => {
      const key = specialtyKeys[s];
      const badge = document.createElement('span');
      badge.textContent = key ? UX.t(`specialty.${key}`, {}, s) : s;
      specialties.append(badge);
    });

    info.append(name, meta, details, specialties);
    link.append(avatar, info);
    article.append(link);
    return article;
  }

  function renderResults(list, paginationData) {
    clearResults();
    if (!list.length) {
      resultsEmpty.hidden = false;
      return;
    }
    list.forEach((photographer) => resultsList.append(photographerCard(photographer)));
    pagination.hidden = false;
    pageInfo.textContent = `${paginationData.page} / ${paginationData.totalPages}`;
    prevPageBtn.disabled = paginationData.page <= 1;
    nextPageBtn.disabled = paginationData.page >= paginationData.totalPages;
  }

  async function load() {
    clearResults();
    UX.setBusy(document.getElementById('searchButton'), true);
    try {
      const params = new URLSearchParams();
      if (cityInput.value.trim()) params.set('city', cityInput.value.trim());
      if (stateInput.value.trim()) params.set('state', String(stateInput.value).trim().toUpperCase());
      if (specialtyInput.value) params.set('specialty', specialtyInput.value);
      if (availabilityInput.value) params.set('availability', availabilityInput.value);
      if (minPriceInput.value) params.set('minPrice', minPriceInput.value);
      if (maxPriceInput.value) params.set('maxPrice', maxPriceInput.value);
      if (minRadiusInput.value) params.set('minRadius', minRadiusInput.value);
      if (sortInput.value) params.set('sort', sortInput.value);
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));

      const { data } = await UX.apiFetch(`/api/photographers?${params.toString()}`, { headers: { Accept: 'application/json' } });
      currentResults = data.photographers || [];
      currentPagination = data.pagination || { page: 1, pageSize, total: currentResults.length, totalPages: 1 };
      renderResults(currentResults, currentPagination);
    } catch (error) {
      UX.showMessage(resultsEmpty, error.message || UX.t('search.error', {}, 'Não foi possível buscar fotógrafos.'), 'error');
    } finally {
      UX.setBusy(document.getElementById('searchButton'), false);
    }
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); page = 1; load(); });
  clearFiltersBtn.addEventListener('click', () => { form.reset(); page = 1; load(); });
  prevPageBtn.addEventListener('click', () => { if (page > 1) { page -= 1; load(); } });
  nextPageBtn.addEventListener('click', () => { page += 1; load(); });

  document.addEventListener('translations.updated', () => {
    if (currentPagination) renderResults(currentResults, currentPagination);
  });

  Promise.resolve(window.i18n?.ready).then(load);
})();

(function () {
  const UX = window.LensClickUX;
  const form = document.getElementById('searchForm');
  const stateInput = document.getElementById('filterState');
  const cityInput = document.getElementById('filterCity');
  const specialtyInput = document.getElementById('filterSpecialty');
  const availabilityInput = document.getElementById('filterAvailability');
  const resultsList = document.getElementById('resultsList');
  const resultsEmpty = document.getElementById('resultsEmpty');
  const pagination = document.getElementById('pagination');
  const prevPageBtn = document.getElementById('prevPage');
  const nextPageBtn = document.getElementById('nextPage');
  const pageInfo = document.getElementById('pageInfo');

  let page = 1;
  let pageSize = 12;

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
    const specialties = document.createElement('div');
    specialties.className = 'public-specialties small';
    (p.specialties || []).slice(0,3).forEach(s => {
      const badge = document.createElement('span'); badge.textContent = s; specialties.append(badge);
    });

    info.append(name, meta, specialties);
    link.append(avatar, info);
    article.append(link);
    return article;
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
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));

      const { data } = await UX.apiFetch(`/api/photographers?${params.toString()}`, { headers: { Accept: 'application/json' } });
      const list = data.photographers || [];
      if (!list.length) {
        resultsEmpty.hidden = false;
        return;
      }
      list.forEach((p) => resultsList.append(photographerCard(p)));
      // pagination
      const paginationData = data.pagination || { page: 1, pageSize, total: list.length };
      pagination.hidden = false;
      pageInfo.textContent = `${paginationData.page} / ${paginationData.totalPages}`;
      prevPageBtn.disabled = paginationData.page <= 1;
      nextPageBtn.disabled = paginationData.page >= paginationData.totalPages;
    } catch (error) {
      UX.showMessage(resultsEmpty, error.message || 'Erro ao buscar fotógrafos.', 'error');
    } finally {
      UX.setBusy(document.getElementById('searchButton'), false);
    }
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); page = 1; load(); });
  prevPageBtn.addEventListener('click', () => { if (page > 1) { page -= 1; load(); } });
  nextPageBtn.addEventListener('click', () => { page += 1; load(); });

  // initial load
  load();
})();

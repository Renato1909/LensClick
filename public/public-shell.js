(function () {
  'use strict';

  const UX = window.LensClickUX || {};

  function isEnglish() {
    return document.documentElement.lang.toLowerCase().startsWith('en');
  }

  function t(key) {
    if (window.LensClickI18N && typeof window.LensClickI18N.t === 'function') {
      return window.LensClickI18N.t(key);
    }
    return '';
  }

  function applyI18nToLocationControls(ufSelect, citySelect) {
    const allStatesResolved = t('search.filters.allStates') || (isEnglish() ? 'All states' : 'Todos os estados');
    const allCitiesResolved = t('search.filters.allCities') || (isEnglish() ? 'All cities' : 'Todas as cidades');

    const ufPlaceholder = ufSelect.options[0];
    if (ufPlaceholder && ufPlaceholder.value === '') ufPlaceholder.textContent = allStatesResolved;
    const cityPlaceholder = citySelect.options[0];
    if (cityPlaceholder && cityPlaceholder.value === '') cityPlaceholder.textContent = allCitiesResolved;

    ufSelect.setAttribute('aria-label', isEnglish() ? 'State (UF)' : 'Estado (UF)');
    citySelect.setAttribute('aria-label', isEnglish() ? 'City' : 'Cidade');
  }

  function initLocationControls() {
    const ufSelect = document.getElementById('filterState');
    const citySelect = document.getElementById('filterCity');
    if (!ufSelect || !citySelect) return;

    const data = window.BrazilLocations;
    if (!data) {
      // Fallback: keep current behavior (free-text input) if the data file failed to load.
      return;
    }

    // Convert city input into a select if it is currently a text input.
    if (citySelect.tagName !== 'SELECT') {
      const replacement = document.createElement('select');
      replacement.id = citySelect.id;
      replacement.name = citySelect.name || 'city';
      replacement.className = citySelect.className;
      replacement.disabled = false;
      citySelect.replaceWith(replacement);
      citySelect = replacement;
    }

    // Build UF options (keep current selection if any).
    const previousUf = ufSelect.value;
    const previousCity = citySelect.value;
    ufSelect.replaceChildren();

    const allCitiesLabel = isEnglish() ? 'All cities' : 'Todas as cidades';
    const allUfLabel = isEnglish() ? 'All states' : 'Todos os estados';

    const placeholderOpt = document.createElement('option');
    placeholderOpt.value = '';
    placeholderOpt.textContent = allUfLabel;
    ufSelect.append(placeholderOpt);

    data.states.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s.uf;
      opt.textContent = `${s.uf} — ${s.name}`;
      opt.dataset.name = s.name;
      ufSelect.append(opt);
    });

    function rebuildCities(uf, selectedCity) {
      citySelect.replaceChildren();
      const defaultOpt = document.createElement('option');
      defaultOpt.value = '';
      defaultOpt.textContent = allCitiesLabel;
      citySelect.append(defaultOpt);
      const cities = uf ? data.citiesFor(uf) : [];
      cities.forEach((c) => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        citySelect.append(opt);
      });
      if (selectedCity && cities.includes(selectedCity)) {
        citySelect.value = selectedCity;
      }
      // Always allow the user to keep the full list (incl. capital) without a UF.
      citySelect.disabled = false;
    }

    ufSelect.addEventListener('change', () => {
      const uf = ufSelect.value;
      const currentCity = citySelect.value;
      const citiesInUf = uf ? data.citiesFor(uf) : [];
      let selectedCity = null;
      if (currentCity && citiesInUf.includes(currentCity)) {
        selectedCity = currentCity;
      }
      rebuildCities(uf, selectedCity);
    });

    citySelect.addEventListener('change', () => {
      const city = citySelect.value.trim();
      if (!city) {
        return;
      }
      const currentState = ufSelect.value;
      let stateForCity = null;
      if (currentState) {
        if (data.citiesFor(currentState).includes(city)) {
          return;
        }
      }
      const statesForCity = data.states
        .filter(s => data.citiesFor(s.uf).includes(city))
        .map(s => s.uf);
      if (statesForCity.length === 1) {
        ufSelect.value = statesForCity[0];
      }
    });

    if (previousUf) ufSelect.value = previousUf;
    const initialUf = ufSelect.value;
    if (!initialUf) {
      // Pre-populate the city list with the largest cities (capitals) so the
      // form is usable from the first render. Once the user picks a UF the
      // list is replaced with the cities of that state.
      const capitalCities = data.states
        .map((s) => data.citiesFor(s.uf)[0])
        .filter(Boolean);
      citySelect.replaceChildren();
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = allCitiesLabel;
      citySelect.append(placeholder);
      capitalCities.forEach((c) => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        citySelect.append(opt);
      });
    } else {
      rebuildCities(initialUf, previousCity);
    }

    applyI18nToLocationControls(ufSelect, citySelect);
  }

  function refreshLocationLabels() {
    initLocationControls();
  }

  function initAuthState() {
    const loginLink = document.getElementById('publicLogin');
    const profile = document.getElementById('publicProfile');
    const profilePic = document.getElementById('publicProfilePic');
    const profileInitial = document.getElementById('publicProfileInitial');
    const profileName = document.getElementById('publicProfileName');

    if (!loginLink || !profile) return;

    function showLoggedIn(user) {
      loginLink.hidden = true;
      profile.hidden = false;
      profile.href = 'perfil.html';

      const name = String(user?.name || '').trim();
      if (name) {
        const first = name.split(/\s+/)[0];
        const max = 12;
        profileName.textContent = first.length > max ? first.slice(0, max - 1) + '…' : first;
        profileName.title = name;
        profileName.hidden = false;
      } else {
        profileName.hidden = true;
      }

      if (user?.profilePic) {
        profilePic.src = user.profilePic;
        profilePic.hidden = false;
        profilePic.alt = name || 'Foto de perfil';
        if (profileInitial) profileInitial.hidden = true;
      } else {
        profilePic.hidden = true;
        profilePic.removeAttribute('src');
        if (profileInitial) {
          profileInitial.textContent = (name || 'LC').split(/\s+/).slice(0, 2).map((p) => p[0] || '').join('').toUpperCase();
          profileInitial.hidden = false;
        }
      }
    }

    function showLoggedOut() {
      loginLink.hidden = false;
      profile.hidden = true;
      profileName.textContent = '';
    }

    // Default to logged out, then try to upgrade.
    showLoggedOut();

    const fetcher = (async () => {
      try {
        const response = await fetch('/api/auth/me', { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
        if (!response.ok) return;
        const contentType = (response.headers.get('content-type') || '').toLowerCase();
        if (!contentType.includes('application/json')) return;
        const user = await response.json();
        if (user && (user.id || user.email || user.name)) {
          showLoggedIn(user);
        }
      } catch {
        /* keep logged-out UI */
      }
    })();

    // Expose for potential cross-page hooks.
    window.LensClickPublic = Object.assign(window.LensClickPublic || {}, {
      authReady: fetcher
    });
  }

  function init() {
    initLocationControls();
    initAuthState();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  // Re-apply i18n when the language changes.
  document.addEventListener('translations.updated', () => {
    refreshLocationLabels();
  });
})();

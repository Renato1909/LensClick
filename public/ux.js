(function () {
  function isEnglish() {
    return document.documentElement.lang.toLowerCase().startsWith('en');
  }

  function textByLanguage(portuguese, english) {
    return isEnglish() ? english : portuguese;
  }

  async function parseApiResponse(response, fallbackMessage) {
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('application/json')) {
      try {
        return await response.json();
      } catch {
        return { error: fallbackMessage };
      }
    }
    return { error: fallbackMessage };
  }

  async function apiFetch(input, options, fallbackMessage) {
    let response;
    try {
      response = await fetch(input, options);
    } catch {
      const error = new Error(textByLanguage('Não foi possível conectar ao servidor.', 'Could not connect to the server.'));
      error.status = 0;
      throw error;
    }
    const data = await parseApiResponse(response, fallbackMessage);
    if (!response.ok) {
      const error = new Error(data.error || fallbackMessage);
      error.status = response.status;
      throw error;
    }
    return { response, data };
  }

  function setBusy(button, busy, labels = {}) {
    if (!button) return;
    if (busy) {
      if (!button.dataset.idleLabel) button.dataset.idleLabel = button.textContent;
      if (!button.dataset.idleHtml) button.dataset.idleHtml = button.innerHTML;
      button.disabled = true;
      button.classList.add('is-loading');
      button.setAttribute('aria-busy', 'true');
      button.textContent = textByLanguage(labels.pt || 'Aguarde...', labels.en || 'Please wait...');
      return;
    }
    button.disabled = false;
    button.classList.remove('is-loading');
    button.removeAttribute('aria-busy');
    if (button.dataset.idleHtml) button.innerHTML = button.dataset.idleHtml;
    else if (button.dataset.idleLabel) button.textContent = button.dataset.idleLabel;
    delete button.dataset.idleLabel;
    delete button.dataset.idleHtml;
  }

  function showMessage(element, message, type = 'info') {
    if (!element) return;
    element.hidden = !message;
    element.style.display = message ? 'block' : 'none';
    element.textContent = message || '';
    element.dataset.type = type;
    element.setAttribute('role', type === 'error' ? 'alert' : 'status');
    element.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
  }

  function highlight(element) {
    if (!element) return;
    element.classList.remove('is-highlighted');
    requestAnimationFrame(() => {
      element.classList.add('is-highlighted');
      window.setTimeout(() => element.classList.remove('is-highlighted'), 900);
    });
  }

  function prefersReducedMotion() {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  }

  function updateAccessibilityLabels() {
    const attribute = isEnglish() ? 'data-a11y-en' : 'data-a11y-pt';
    document.querySelectorAll('[data-a11y-pt][data-a11y-en]').forEach((element) => {
      const label = element.getAttribute(attribute);
      if (label) element.setAttribute('aria-label', label);
    });
  }

  function updateFieldValidity(field) {
    if (!field?.checkValidity || !field.classList.contains('is-touched')) return;
    const invalid = !field.checkValidity();
    field.classList.toggle('is-invalid', invalid);
    if (invalid) field.setAttribute('aria-invalid', 'true');
    else field.removeAttribute('aria-invalid');
  }

  function installFieldFeedback() {
    document.addEventListener('focusout', (event) => {
      const field = event.target.closest?.('input, select, textarea');
      if (field?.form && !field.disabled) {
        field.classList.add('is-touched');
        updateFieldValidity(field);
      }
    }, true);

    document.addEventListener('input', (event) => {
      const field = event.target.closest?.('input, textarea');
      updateFieldValidity(field);
    });

    document.addEventListener('change', (event) => {
      updateFieldValidity(event.target.closest?.('input, select, textarea'));
    });

    document.addEventListener('invalid', (event) => {
      const field = event.target.closest?.('input, select, textarea');
      if (!field) return;
      field.classList.add('is-touched', 'is-invalid');
      field.setAttribute('aria-invalid', 'true');
    }, true);
  }

  function safeNextDestination(fallback = 'perfil.html') {
    const next = new URLSearchParams(window.location.search).get('next');
    return next && /^[a-z0-9_-]+\.html(?:[?#][^\s]*)?$/i.test(next) ? next : fallback;
  }

  window.LensClickUX = {
    apiFetch,
    highlight,
    isEnglish,
    prefersReducedMotion,
    safeNextDestination,
    setBusy,
    showMessage,
    textByLanguage,
    updateAccessibilityLabels
  };

  installFieldFeedback();
  updateAccessibilityLabels();
  document.addEventListener('translations.updated', updateAccessibilityLabels);
})();

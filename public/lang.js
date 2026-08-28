/* LensClick i18n runtime.
   Translation catalogs live in /locales and the Portuguese HTML remains the
   progressive fallback when a catalog cannot be loaded. */
(function () {
  'use strict'

  const DEFAULT_LOCALE = 'pt-BR'
  const STORAGE_KEY = 'lang'
  const TRANSLATABLE_SELECTOR = [
    '[data-i18n]',
    '[data-i18n-placeholder]',
    '[data-i18n-title]',
    '[data-i18n-aria]',
    '[data-i18n-section]'
  ].join(', ')
  const SUPPORTED_LOCALES = Object.freeze({ pt: 'pt-BR', en: 'en-US' })
  const scriptUrl = document.currentScript?.src || new URL('lang.js', window.location.href).href
  const catalogBaseUrl = new URL('locales/', scriptUrl)
  const catalogs = new Map()
  const catalogRequests = new Map()
  const originalValues = new WeakMap()
  let transitionRun = 0

  function normalizeLocale(value) {
    const candidate = String(value || '').trim().toLowerCase()
    if (candidate === 'en' || candidate.startsWith('en-')) return SUPPORTED_LOCALES.en
    return SUPPORTED_LOCALES.pt
  }

  function initialLocale() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) return normalizeLocale(saved)
    } catch {
      // The browser may block storage. Language selection still works in memory.
    }
    return normalizeLocale(navigator.languages?.[0] || navigator.language || 'pt-BR')
  }

  let locale = initialLocale()
  document.documentElement.lang = locale

  function catalogUrl(targetLocale) {
    return new URL(`${targetLocale}.json`, catalogBaseUrl)
  }

  function loadCatalog(targetLocale) {
    if (catalogs.has(targetLocale)) return Promise.resolve(catalogs.get(targetLocale))
    if (catalogRequests.has(targetLocale)) return catalogRequests.get(targetLocale)

    const request = fetch(catalogUrl(targetLocale), {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin'
    }).then(async (response) => {
      if (!response.ok) throw new Error('translation_catalog_unavailable')
      const catalog = await response.json()
      if (!catalog || Array.isArray(catalog) || typeof catalog !== 'object') {
        throw new Error('translation_catalog_invalid')
      }
      catalogs.set(targetLocale, Object.freeze(catalog))
      return catalog
    }).catch(() => Object.freeze({})).finally(() => {
      catalogRequests.delete(targetLocale)
    })

    catalogRequests.set(targetLocale, request)
    return request
  }

  function currentYear() {
    const year = new Date().getFullYear()
    return year > 2025 ? `2025–${year}` : '2025'
  }

  function interpolate(message, params = {}) {
    const values = { year: currentYear(), ...params }
    return String(message).replace(/\{([a-zA-Z0-9_]+)\}/g, (token, name) => (
      Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : token
    ))
  }

  function t(key, params = {}, fallback = '') {
    const normalizedKey = String(key || '').trim()
    if (!normalizedKey) return interpolate(fallback, params)
    const selected = catalogs.get(locale)?.[normalizedKey]
    const defaultValue = catalogs.get(DEFAULT_LOCALE)?.[normalizedKey]
    return interpolate(selected ?? defaultValue ?? fallback, params)
  }

  function captureOriginalValues(root = document) {
    root.querySelectorAll(TRANSLATABLE_SELECTOR).forEach((element) => {
      if (originalValues.has(element)) return
      originalValues.set(element, {
        html: element.innerHTML,
        text: element.textContent,
        placeholder: element.getAttribute('placeholder') || '',
        title: element.getAttribute('title') || '',
        aria: element.getAttribute('aria-label') || '',
        section: element.getAttribute('data-section') || ''
      })
    })
  }

  function translatedOrOriginal(element, key, type) {
    const original = originalValues.get(element)
    return t(key, {}, original?.[type] || '')
  }

  function updateToggle() {
    const button = document.getElementById('langToggle')
    if (!button) return

    const flags = {
      'pt-BR': `
        <svg class="flag-svg" width="18" height="12" viewBox="0 0 18 12" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <rect width="18" height="12" fill="#009b3a"/>
          <polygon points="9,2 2,6 9,10 16,6" fill="#ffdf00"/>
          <circle cx="9" cy="6" r="2.4" fill="#002776"/>
        </svg>`,
      'en-US': `
        <svg class="flag-svg" width="18" height="12" viewBox="0 0 18 12" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <rect width="18" height="12" fill="#b22234"/>
          <rect y="1.2" width="18" height="1.2" fill="#fff"/>
          <rect y="3.6" width="18" height="1.2" fill="#fff"/>
          <rect y="6" width="18" height="1.2" fill="#fff"/>
          <rect y="8.4" width="18" height="1.2" fill="#fff"/>
          <rect width="7" height="5" fill="#3c3b6e"/>
        </svg>`
    }

    const abbreviation = locale === DEFAULT_LOCALE ? 'PT' : 'EN'
    button.innerHTML = `${flags[locale]} <span class="abbr">${abbreviation}</span>`
    button.setAttribute('aria-label', t('language.toggle'))
  }

  function applyValues() {
    document.querySelectorAll('[data-i18n]').forEach((element) => {
      const key = element.getAttribute('data-i18n')
      if (!key) return
      if (element.getAttribute('data-i18n-html') === 'true') {
        element.innerHTML = translatedOrOriginal(element, key, 'html')
      } else {
        element.textContent = translatedOrOriginal(element, key, 'text')
      }
    })

    document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
      const key = element.getAttribute('data-i18n-placeholder')
      if (key) element.placeholder = translatedOrOriginal(element, key, 'placeholder')
    })

    document.querySelectorAll('[data-i18n-title]').forEach((element) => {
      const key = element.getAttribute('data-i18n-title')
      if (key) element.title = translatedOrOriginal(element, key, 'title')
    })

    document.querySelectorAll('[data-i18n-aria]').forEach((element) => {
      const key = element.getAttribute('data-i18n-aria')
      if (key) element.setAttribute('aria-label', translatedOrOriginal(element, key, 'aria'))
    })

    document.querySelectorAll('[data-i18n-section]').forEach((element) => {
      const key = element.getAttribute('data-i18n-section')
      if (!key) return
      const label = translatedOrOriginal(element, key, 'section').replace(/<[^>]*>/g, '').trim()
      element.setAttribute('data-section', label)
      element.setAttribute('aria-label', label)
    })

    document.querySelectorAll('.price-sep').forEach((separator) => {
      separator.textContent = t('common.priceSeparator')
    })

    document.documentElement.lang = locale
    updateToggle()
  }

  function notifyUpdated() {
    document.dispatchEvent(new CustomEvent('translations.updated', {
      detail: { language: locale.startsWith('en') ? 'en' : 'pt', locale }
    }))
  }

  function wait(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
  }

  async function applyTranslations({ animate = false } = {}) {
    const run = ++transitionRun
    captureOriginalValues()
    await Promise.all([loadCatalog(DEFAULT_LOCALE), loadCatalog(locale)])
    if (run !== transitionRun) return

    const animatedElements = Array.from(document.querySelectorAll(TRANSLATABLE_SELECTOR))
      .filter((element) => element instanceof HTMLElement && element.tagName !== 'TITLE')
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

    if (!animate || reducedMotion) {
      applyValues()
      notifyUpdated()
      return
    }

    animatedElements.forEach((element) => {
      element.classList.add('i18n-transitioning')
      element.style.transition = 'opacity .28s ease, transform .28s ease'
      element.style.opacity = '0'
      element.style.transform = 'translateY(6px)'
    })

    await wait(220)
    if (run !== transitionRun) return
    applyValues()

    animatedElements.forEach((element) => {
      element.style.opacity = '1'
      element.style.transform = 'none'
      window.setTimeout(() => {
        element.style.transition = ''
        element.classList.remove('i18n-transitioning')
      }, 350)
    })
    notifyUpdated()
  }

  async function setLanguage(value, { persist = true, animate = true } = {}) {
    locale = normalizeLocale(value)
    document.documentElement.lang = locale
    if (persist) {
      try {
        localStorage.setItem(STORAGE_KEY, locale)
      } catch {
        // Storage is optional; the in-memory preference remains active.
      }
    }
    await applyTranslations({ animate })
    return locale
  }

  function toggleLanguage() {
    return setLanguage(locale === DEFAULT_LOCALE ? SUPPORTED_LOCALES.en : SUPPORTED_LOCALES.pt)
  }

  const ready = new Promise((resolve) => {
    const initialize = async () => {
      const button = document.getElementById('langToggle')
      if (button) button.addEventListener('click', toggleLanguage)
      await applyTranslations()
      resolve(locale)
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initialize, { once: true })
    } else {
      initialize()
    }
  })

  const api = Object.freeze({
    applyTranslations,
    getLanguage: () => locale.startsWith('en') ? 'en' : 'pt',
    getLocale: () => locale,
    ready,
    setLanguage,
    supportedLocales: Object.values(SUPPORTED_LOCALES),
    t,
    toggleLanguage
  })

  window.i18n = api
  window.LensClickI18N = api
})()

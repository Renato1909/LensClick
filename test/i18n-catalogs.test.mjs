import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { readCatalogs } from '../test-utils/i18n.mjs'

const pages = [
  'index.html', 'cadastro.html', 'login.html', 'recuperar-senha.html',
  'redefinir-senha.html', 'perfil.html', 'fotografo.html', 'busca.html',
  'privacidade.html', 'termos.html'
]
const scripts = ['lang.js', 'ux.js', 'profile-api.js', 'photographer-profile.js', 'public-shell.js', 'search.js']

test('os catalogos PT-BR e EN-US possuem o mesmo contrato de chaves', () => {
  const catalogs = readCatalogs()
  const portugueseKeys = Object.keys(catalogs['pt-BR']).sort()
  const englishKeys = Object.keys(catalogs['en-US']).sort()

  assert.deepEqual(englishKeys, portugueseKeys)
  assert.ok(portugueseKeys.length >= 400)

  for (const key of portugueseKeys) {
    assert.equal(typeof catalogs['pt-BR'][key], 'string', `pt-BR: ${key}`)
    assert.equal(typeof catalogs['en-US'][key], 'string', `en-US: ${key}`)
    assert.ok(catalogs['pt-BR'][key].trim(), `pt-BR vazio: ${key}`)
    assert.ok(catalogs['en-US'][key].trim(), `en-US vazio: ${key}`)

    const ptParams = [...catalogs['pt-BR'][key].matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((match) => match[1]).sort()
    const enParams = [...catalogs['en-US'][key].matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((match) => match[1]).sort()
    assert.deepEqual(enParams, ptParams, `parâmetros incompatíveis: ${key}`)
  }
})

test('todas as chaves declaradas pela interface existem nos dois catalogos', () => {
  const catalogs = readCatalogs()
  const keys = new Set()

  for (const page of pages) {
    const source = readFileSync(resolve('public', page), 'utf8')
    for (const match of source.matchAll(/data-i18n(?:-placeholder|-title|-aria|-section)?="([^"]+)"/g)) {
      keys.add(match[1])
    }
  }

  for (const script of scripts) {
    const source = readFileSync(resolve('public', script), 'utf8')
    for (const match of source.matchAll(/\b(?:UX|window\.i18n)\.t\('([^']+)'/g)) keys.add(match[1])
  }

  for (const key of keys) {
    assert.ok(catalogs['pt-BR'][key], `chave ausente em pt-BR: ${key}`)
    assert.ok(catalogs['en-US'][key], `chave ausente em en-US: ${key}`)
  }
})

test('o runtime carrega catalogos com fallback, cache, interpolacao e API publica', () => {
  const runtime = readFileSync(resolve('public', 'lang.js'), 'utf8')

  assert.match(runtime, /new URL\('locales\/', scriptUrl\)/)
  assert.match(runtime, /fetch\(catalogUrl\(targetLocale\)/)
  assert.match(runtime, /catalogRequests = new Map\(\)/)
  assert.match(runtime, /selected \?\? defaultValue \?\? fallback/)
  assert.match(runtime, /function interpolate\(message, params = \{\}\)/)
  assert.match(runtime, /window\.i18n = api/)
  assert.match(runtime, /getLocale:/)
  assert.match(runtime, /setLanguage,/)
  assert.match(runtime, /ready,/)
  assert.match(runtime, /translations\.updated/)
  assert.doesNotMatch(runtime, /const translations\s*=/)
})

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export function readCatalog(locale) {
  return JSON.parse(readFileSync(resolve('public', 'locales', `${locale}.json`), 'utf8'))
}

export function readCatalogs() {
  return {
    'pt-BR': readCatalog('pt-BR'),
    'en-US': readCatalog('en-US')
  }
}

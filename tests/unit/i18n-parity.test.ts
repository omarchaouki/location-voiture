import { describe, expect, it } from 'vitest'

import ar from '~/i18n/locales/ar/common.json'
import en from '~/i18n/locales/en/common.json'
import es from '~/i18n/locales/es/common.json'
import fr from '~/i18n/locales/fr/common.json'
import { DEFAULT_LOCALE, LOCALES, type Locale } from '~/i18n/locales'

/**
 * Une clé traduite en français et absente ailleurs passe inaperçue : i18next retombe
 * silencieusement sur le français, et l'utilisateur hispanophone voit du français au
 * milieu de sa page. Ce test transforme cet oubli en échec de build.
 *
 * **Le test est piloté par `LOCALES`, pas par une liste écrite ici.** C'est ce qui a
 * changé le 29/08/2026, en ajoutant l'espagnol : la version précédente nommait l'arabe
 * et l'anglais un par un, et une quatrième langue serait entrée dans le produit sans
 * que rien ne vérifie son dictionnaire. Le dictionnaire manquant, lui, se voit tout de
 * suite — l'import ci-dessous ne compilerait pas.
 */

type Json = Record<string, unknown>

const DICTIONARIES: Record<Locale, Json> = { fr, ar, en, es }

function flatten(value: Json, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return child !== null && typeof child === 'object' && !Array.isArray(child)
      ? flatten(child as Json, path)
      : [path]
  })
}

/** Suffixes de pluriel : l'arabe en a six, le français deux. Ils ne s'alignent pas. */
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/

function baseKeys(value: Json): Set<string> {
  return new Set(flatten(value).map((key) => key.replace(PLURAL_SUFFIX, '')))
}

describe('parité des traductions', () => {
  const reference = baseKeys(DICTIONARIES[DEFAULT_LOCALE])
  const translated = LOCALES.filter((locale) => locale !== DEFAULT_LOCALE)

  it.each(translated)('%s couvre toutes les clés de la langue de référence', (locale) => {
    const missing = [...reference].filter((key) => !baseKeys(DICTIONARIES[locale]).has(key))
    expect(missing).toEqual([])
  })

  it.each(translated)('%s n’a aucune clé orpheline', (locale) => {
    const extra = [...baseKeys(DICTIONARIES[locale])].filter((key) => !reference.has(key))
    expect(extra).toEqual([])
  })

  it('aucune valeur n’est vide', () => {
    for (const [name, dictionary] of Object.entries(DICTIONARIES)) {
      const empties = flatten(dictionary).filter((key) => {
        const value = key
          .split('.')
          .reduce<unknown>((node, part) => (node as Json | undefined)?.[part], dictionary)
        return typeof value === 'string' && value.trim().length === 0
      })
      expect({ [name]: empties }).toEqual({ [name]: [] })
    }
  })
})

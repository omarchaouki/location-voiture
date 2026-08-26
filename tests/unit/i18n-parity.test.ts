import { describe, expect, it } from 'vitest'

import ar from '~/i18n/locales/ar/common.json'
import en from '~/i18n/locales/en/common.json'
import fr from '~/i18n/locales/fr/common.json'

/**
 * Une clé traduite en français et absente en arabe passe inaperçue : i18next
 * retombe silencieusement sur le français, et l'utilisateur arabophone voit du
 * français au milieu de sa page. Ce test transforme cet oubli en échec de build.
 */

type Json = Record<string, unknown>

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
  const reference = baseKeys(fr)

  it('l’arabe couvre toutes les clés du français', () => {
    const missing = [...reference].filter((key) => !baseKeys(ar as Json).has(key))
    expect(missing).toEqual([])
  })

  it('l’anglais couvre toutes les clés du français', () => {
    const missing = [...reference].filter((key) => !baseKeys(en as Json).has(key))
    expect(missing).toEqual([])
  })

  it('aucune langue n’a de clé orpheline', () => {
    const extraAr = [...baseKeys(ar as Json)].filter((key) => !reference.has(key))
    const extraEn = [...baseKeys(en as Json)].filter((key) => !reference.has(key))
    expect({ ar: extraAr, en: extraEn }).toEqual({ ar: [], en: [] })
  })

  it('aucune valeur n’est vide', () => {
    for (const [name, dictionary] of Object.entries({ fr, ar, en })) {
      const empties = flatten(dictionary as Json).filter((key) => {
        const value = key
          .split('.')
          .reduce<unknown>((node, part) => (node as Json | undefined)?.[part], dictionary)
        return typeof value === 'string' && value.trim().length === 0
      })
      expect({ [name]: empties }).toEqual({ [name]: [] })
    }
  })
})

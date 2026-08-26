import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { RTL_TEXT_PLUGIN_URL, RTL_TEXT_PLUGIN_VERSION } from '~/ui/map/rtl-text'

/**
 * Le greffon RTL servi doit être EXACTEMENT celui du paquet installé.
 *
 * Il est auto-hébergé (docs/DECISIONS.md §12.1) : `public/vendor/` est une copie, et
 * une copie dérive. Sans ce test, une montée de version du paquet laisserait
 * silencieusement l'ancien fichier en place — et l'arabe cesserait de se mettre en
 * forme sur la carte sans qu'aucune erreur ne soit levée nulle part.
 */

const require = createRequire(import.meta.url)

describe('greffon RTL auto-hébergé', () => {
  const packageRoot = dirname(dirname(require.resolve('@mapbox/mapbox-gl-rtl-text')))
  const packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
    version: string
    main: string
  }

  it('annonce la version réellement installée', () => {
    expect(RTL_TEXT_PLUGIN_VERSION).toBe(packageJson.version)
  })

  it('sert un fichier identique, octet pour octet, à celui du paquet', () => {
    const served = join(process.cwd(), 'public', RTL_TEXT_PLUGIN_URL.replace(/^\//, ''))
    expect(existsSync(served), `absent — lancer \`pnpm vendor:rtl\` (${served})`).toBe(true)

    const expected = readFileSync(join(packageRoot, packageJson.main))
    expect(readFileSync(served).equals(expected)).toBe(true)
  })
})

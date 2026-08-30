import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  META_PIXEL_ENABLED,
  META_PIXEL_NOSCRIPT_SRC,
  META_PIXEL_SCRIPT,
  shouldTrack,
  trackLead,
  trackPageView,
} from '~/ui/analytics/meta-pixel'

/**
 * PIXEL META.
 *
 * Ce qui est vérifié ici n'est pas que la mesure fonctionne — cela se constate dans le
 * gestionnaire d'événements de Meta, pas dans un test unitaire. C'est qu'elle ne tire
 * pas quand elle ne doit pas : une conversion inventée coûte de l'argent réel, puisque
 * l'algorithme d'enchères apprend dessus.
 */

/**
 * La suite tourne en environnement `node` : il n'y a pas de `window`, et c'est déjà la
 * moitié de ce qu'on veut prouver — le module est importé par le rendu SERVEUR aussi,
 * où toute référence au navigateur ferait tomber la page.
 *
 * Pour le reste, un `window` de fortune suffit. Ajouter jsdom pour trois assertions
 * serait une dépendance de plus dans un projet qui vient d'en retirer dix.
 */
function withFakeWindow(fbq: Window['fbq'], body: () => void): void {
  const globals = globalThis as { window?: unknown }
  globals.window = { fbq }
  try {
    body()
  } finally {
    delete globals.window
  }
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('la décision de mesurer', () => {
  it('exige les DEUX conditions : un identifiant, et la production', () => {
    expect(shouldTrack('1584359083237694', true)).toBe(true)

    // Un identifiant sans production : c'est `pnpm dev`, et il ne compte rien.
    expect(shouldTrack('1584359083237694', false)).toBe(false)
    // La production sans identifiant : le pixel n'est simplement pas installé.
    expect(shouldTrack('', true)).toBe(false)
    expect(shouldTrack('', false)).toBe(false)
  })

  /**
   * Le test le plus important du fichier. Il tourne, par définition, hors production —
   * donc il prouve que la suite de tests elle-même n'envoie rien à Meta.
   */
  it('est éteinte partout sauf en production', () => {
    expect(META_PIXEL_ENABLED).toBe(false)
  })
})

describe('les envois', () => {
  it('ne touchent pas à `fbq` tant que le pixel est éteint', () => {
    const fbq = vi.fn()

    withFakeWindow(fbq, () => {
      trackPageView()
      trackLead()
    })

    expect(fbq).not.toHaveBeenCalled()
  })

  /**
   * Un bloqueur de publicité, une extension ou un réseau coupé font disparaître `fbq`.
   * La mesure est un bonus : elle ne doit jamais faire tomber l'écran d'inscription.
   */
  it('ne lèvent pas quand `fbq` est absent', () => {
    expect(() => {
      withFakeWindow(undefined, () => {
        trackPageView()
        trackLead()
      })
    }).not.toThrow()
  })

  /**
   * Le rendu SERVEUR importe ce module comme n'importe quel autre. Une référence nue à
   * `window` y ferait tomber la page entière, pas seulement la mesure.
   */
  it('ne lèvent pas non plus sans `window` du tout, côté serveur', () => {
    expect(typeof globalThis.window).toBe('undefined')
    expect(() => {
      trackPageView()
      trackLead()
    }).not.toThrow()
  })
})

describe('le fragment injecté', () => {
  /**
   * `JSON.stringify` et non une interpolation nue : une valeur mal saisie dans `.env`
   * ne doit pas pouvoir fermer la chaîne et injecter du script dans la page.
   */
  it('échappe l’identifiant plutôt que de le coller tel quel', () => {
    expect(META_PIXEL_SCRIPT).toContain("fbq('init', \"")
    expect(META_PIXEL_SCRIPT).not.toContain("fbq('init', ')")
  })

  it('garde le fragment officiel de Meta mot pour mot', () => {
    // Recopié tel quel : c'est ce que l'outil de diagnostic de Meta reconnaît, et ce
    // qui rend sa mise à jour mécanique le jour où le fournisseur le change.
    expect(META_PIXEL_SCRIPT).toContain('connect.facebook.net/en_US/fbevents.js')
    expect(META_PIXEL_SCRIPT).toContain("fbq('track', 'PageView')")
  })

  it('encode l’identifiant dans l’adresse du repli sans script', () => {
    expect(META_PIXEL_NOSCRIPT_SRC).toContain('ev=PageView&noscript=1')
    expect(META_PIXEL_NOSCRIPT_SRC.startsWith('https://www.facebook.com/tr?id=')).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'

import { MOROCCAN_CITIES } from '~/core/cities'

/**
 * La liste des villes sert la SAISIE, pas l'autorisation — le champ qui l'utilise
 * accepte le texte libre. Ce qu'elle doit garantir tient en trois points, et les
 * trois se cassent silencieusement à la première relecture distraite.
 */
describe('villes marocaines', () => {
  it('porte les deux écritures pour chaque ville', () => {
    const incomplete = MOROCCAN_CITIES.filter(
      (city) => city.fr.trim().length === 0 || city.ar.trim().length === 0,
    )
    expect(incomplete).toEqual([])
  })

  /**
   * Un doublon crée deux entrées identiques dans la liste déroulante : l'utilisateur
   * hésite, choisit au hasard, et deux agences de la même ville se retrouvent
   * rangées différemment.
   */
  it('n’a pas de doublon', () => {
    const french = MOROCCAN_CITIES.map((city) => city.fr)
    const arabic = MOROCCAN_CITIES.map((city) => city.ar)
    expect(new Set(french).size).toBe(french.length)
    expect(new Set(arabic).size).toBe(arabic.length)
  })

  /**
   * Le nom arabe doit être en ÉCRITURE arabe. Recopier « Casablanca » dans la
   * colonne arabe passerait tous les autres contrôles et afficherait du latin au
   * milieu d'une page de droite à gauche.
   */
  it('écrit les noms arabes en caractères arabes', () => {
    const arabicRange = /^[؀-ۿ\s'’-]+$/
    const wrong = MOROCCAN_CITIES.filter((city) => !arabicRange.test(city.ar))
    expect(wrong).toEqual([])
  })

  it('commence par les villes où l’on loue le plus', () => {
    // Une liste qui s'ouvre sur « Ahfir » est une liste qu'on referme.
    expect(MOROCCAN_CITIES.slice(0, 3).map((city) => city.fr)).toEqual([
      'Casablanca',
      'Marrakech',
      'Agadir',
    ])
  })
})

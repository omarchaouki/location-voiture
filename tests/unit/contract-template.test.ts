import { describe, expect, it } from 'vitest'

import {
  defaultTemplate,
  fillVariables,
  linesOf,
  parseBlocks,
  parseRuns,
  TEMPLATE_VARIABLES,
} from '~/core/contract-template'
import { LOCALES } from '~/i18n/locales'

/**
 * LE MODÈLE DE CONTRAT — module pur, donc éprouvable à froid.
 *
 * Ce qui s'imprime ici part avec le client et se signe. Trois propriétés comptent, et
 * la troisième est celle qui justifie tout le reste de la conception :
 *
 *  1. une variable dont la donnée manque laisse un BLANC VISIBLE, pas un silence ;
 *  2. une variable inconnue reste telle quelle, plutôt que de s'effacer ;
 *  3. **rien de ce qui est tapé ne peut devenir du balisage.** Le contenu est stocké en
 *     blocs et rendu en éléments React, jamais en HTML — ce test fige la propriété
 *     côté analyse, le rendu (`src/ui/contracts/template-render.tsx`) ne fait ensuite
 *     que poser des `<strong>` et des `<em>` autour de fragments de texte.
 */

describe('variables du modèle', () => {
  it('remplace ce qu’elle connaît', () => {
    const filled = fillVariables('Véhicule {{vehicle.plate}} au nom de {{customer.name}}.', {
      'vehicle.plate': '12345 | أ | 6',
      'customer.name': 'Yassine Berrada',
    })
    expect(filled).toBe('Véhicule 12345 | أ | 6 au nom de Yassine Berrada.')
  })

  /**
   * Un blanc muet ne se voit pas au moment de signer ; des points de conduite, si —
   * et ils se complètent au stylo, ce qui est exactement ce qu'on veut d'un contrat
   * dont une donnée manque.
   */
  it('laisse un blanc visible pour une donnée manquante', () => {
    expect(fillVariables('CIN n° {{customer.idNumber}}', {})).toBe('CIN n° ……………')
  })

  /**
   * Une clé qui disparaît en silence emporte une phrase entière avec elle, et personne
   * ne s'en aperçoit — surtout pas au comptoir, en tendant le papier.
   */
  it('laisse intacte une variable qu’elle ne connaît pas', () => {
    expect(fillVariables('Solvabilité : {{customer.solvabilite}}', {})).toBe(
      'Solvabilité : {{customer.solvabilite}}',
    )
  })

  it('accepte les espaces autour du nom', () => {
    expect(fillVariables('{{ contract.total }}', { 'contract.total': '1 200,00 MAD' })).toBe(
      '1 200,00 MAD',
    )
  })
})

describe('mise en forme fine', () => {
  it('sépare le gras et l’italique du texte ordinaire', () => {
    expect(parseRuns('Article **1** et __réserve__')).toEqual([
      { text: 'Article ', bold: false, italic: false },
      { text: '1', bold: true, italic: false },
      { text: ' et ', bold: false, italic: false },
      { text: 'réserve', bold: false, italic: true },
    ])
  })

  /**
   * LA PROPRIÉTÉ DE SÛRETÉ : le balisage reste du texte.
   *
   * `parseRuns` ne produit que des fragments de chaîne ; aucun appelant ne peut donc
   * en tirer du balisage exécutable. C'est ce qui rend l'éditeur inoffensif quoi que
   * l'agence tape dans ses clauses — et c'est la raison pour laquelle le modèle n'est
   * pas stocké en HTML.
   */
  it('traite une balise comme du texte', () => {
    const runs = parseRuns('<script>alert(1)</script>')
    expect(runs).toEqual([{ text: '<script>alert(1)</script>', bold: false, italic: false }])
  })

  it('ignore une marque qui n’enferme rien', () => {
    expect(parseRuns('2 ** 3')).toEqual([{ text: '2 ** 3', bold: false, italic: false }])
  })

  it('écarte les lignes vides d’une liste', () => {
    expect(linesOf({ kind: 'list', text: 'un\n\n  deux  \n' })).toEqual(['un', 'deux'])
  })
})

describe('lecture du modèle stocké', () => {
  it('relit ce qu’elle a écrit', () => {
    const blocks = defaultTemplate('fr')
    expect(parseBlocks(JSON.stringify(blocks))).toEqual(blocks)
  })

  /**
   * Un modèle corrompu — migration ratée, écriture manuelle en base — ne doit pas
   * casser l'impression d'un contrat : la fiche s'affiche sans clauses, l'écran propose
   * de repartir du modèle du produit, et personne ne voit une page blanche.
   */
  it.each([
    ['nul', null],
    ['vide', ''],
    ['JSON invalide', '{ pas du json'],
    ['forme inattendue', '{"blocks":"non"}'],
    ['type de bloc inconnu', '[{"kind":"tableau","text":"x"}]'],
  ])('rend une liste vide sur un contenu %s', (_label, stored) => {
    expect(parseBlocks(stored)).toEqual([])
  })
})

describe('modèle par défaut', () => {
  it.each(LOCALES)('existe dans la langue %s', (locale) => {
    const blocks = defaultTemplate(locale)
    expect(blocks.length).toBeGreaterThan(5)
    expect(blocks.some((block) => block.kind === 'signatures')).toBe(true)
  })

  /**
   * Un modèle livré avec une variable mal orthographiée s'imprimerait tel quel sur le
   * premier contrat de chaque nouvelle agence — et personne ne rapproche
   * « {{vehicule.plaque}} » d'une faute de frappe côté produit.
   */
  it.each(LOCALES)('n’emploie que des variables connues en %s', (locale) => {
    const used = defaultTemplate(locale)
      .flatMap((block) => [...block.text.matchAll(/\{\{\s*([a-zA-Z.]+)\s*\}\}/g)])
      .map((match) => match[1])

    const unknown = used.filter(
      (name) => !(TEMPLATE_VARIABLES as readonly string[]).includes(name!),
    )
    expect(unknown).toEqual([])
  })

  it('rend une copie modifiable, jamais le tableau partagé', () => {
    const first = defaultTemplate('fr')
    first[0]!.text = 'Modifié'
    expect(defaultTemplate('fr')[0]?.text).not.toBe('Modifié')
  })
})

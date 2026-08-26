import { beforeEach, describe, expect, it } from 'vitest'

import { formatMoroccanPhone, isMoroccanPhone, parseMoroccanPhone } from '~/core/phone'
import { LeadInput } from '~/core/schemas/lead'
import type { Db } from '~/db/client'
import { leadRepository } from '~/db/repositories/leads'
import { hashIp, recordLead } from '~/server/lead-intake'
import { setNotifier } from '~/server/notifier'
import { createTestDb } from '../helpers/db'

/**
 * DEMANDES DE DÉMONSTRATION.
 *
 * Le seul point d'écriture PUBLIC du produit. Trois choses à prouver :
 *  1. six écritures du même numéro donnent UN prospect, pas six ;
 *  2. le leurre anti-robot ne laisse rien passer, et ne dit rien au robot ;
 *  3. aucune adresse IP n'est stockée en clair.
 */

const NOW = new Date('2026-08-25T10:00:00.000Z')

function payload(overrides: Record<string, unknown> = {}) {
  return LeadInput.parse({
    name: 'Youssef Benali',
    phone: '06 12 34 56 78',
    locale: 'fr',
    ...overrides,
  })
}

let db: Db

beforeEach(() => {
  db = createTestDb()
  setNotifier({ id: 'muet', send: () => Promise.resolve() })
})

describe('téléphone marocain', () => {
  /**
   * Le test qui justifie le module : ces six chaînes sont le même numéro. Rangées
   * telles quelles, elles feraient six prospects distincts — et six rappels.
   */
  it('range six écritures du même numéro sous une seule forme', () => {
    const forms = [
      '0612345678',
      '06 12 34 56 78',
      '06-12-34-56-78',
      '+212612345678',
      '+212 6 12 34 56 78',
      '00212612345678',
    ]
    const canonical = forms.map((form) => parseMoroccanPhone(form))
    expect(new Set(canonical)).toEqual(new Set(['+212612345678']))
  })

  it('accepte les fixes et les nouveaux préfixes mobiles', () => {
    expect(parseMoroccanPhone('0522445566')).toBe('+212522445566')
    expect(parseMoroccanPhone('0712345678')).toBe('+212712345678')
  })

  it('refuse ce qui n’est pas un numéro marocain', () => {
    expect(parseMoroccanPhone('')).toBeNull()
    expect(parseMoroccanPhone('061234567')).toBeNull() // un chiffre de moins
    expect(parseMoroccanPhone('06123456789')).toBeNull() // un de trop
    expect(parseMoroccanPhone('0112345678')).toBeNull() // préfixe inexistant
    expect(parseMoroccanPhone('+33612345678')).toBeNull() // français
    expect(isMoroccanPhone('bonjour')).toBe(false)
  })

  it('affiche la forme nationale, pas l’internationale', () => {
    expect(formatMoroccanPhone('+212612345678')).toBe('06 12 34 56 78')
  })
})

describe('le schéma du formulaire', () => {
  it('normalise le téléphone à la validation', () => {
    expect(payload({ phone: '+212 6 12 34 56 78' }).phone).toBe('+212612345678')
  })

  it('refuse un numéro qui n’en est pas un', () => {
    expect(() => payload({ phone: '12' })).toThrow()
  })

  it('n’exige ni société, ni adresse électronique', () => {
    expect(() => payload()).not.toThrow()
  })
})

describe('enregistrement', () => {
  it('crée le prospect et le range en forme canonique', async () => {
    await recordLead(db, payload({ company: 'Atlas Cars', city: 'Casablanca' }), {
      ipHash: null,
      now: NOW,
    })

    const rows = await leadRepository(db).list()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.phone).toBe('+212612345678')
    expect(rows[0]?.status).toBe('new')
    expect(rows[0]?.source).toBe('site')
  })

  /**
   * Le leurre ne renvoie PAS d'erreur : dire au robot qu'il a été repéré revient à
   * lui apprendre à ne plus remplir le champ.
   */
  it('jette une soumission dont le leurre est rempli, sans le dire', async () => {
    const result = await recordLead(db, payload({ website: 'http://spam.example' }), {
      ipHash: null,
      now: NOW,
    })

    expect(result).toEqual({ ok: true })
    expect(await leadRepository(db).list()).toHaveLength(0)
  })

  it('ne crée pas deux prospects pour le même numéro dans la journée', async () => {
    await recordLead(db, payload(), { ipHash: null, now: NOW })
    await recordLead(db, payload({ phone: '+212612345678' }), {
      ipHash: null,
      now: new Date('2026-08-25T18:00:00.000Z'),
    })

    expect(await leadRepository(db).list()).toHaveLength(1)
  })

  it('accepte le même numéro le lendemain', async () => {
    await recordLead(db, payload(), { ipHash: null, now: NOW })
    await recordLead(db, payload(), { ipHash: null, now: new Date('2026-08-27T10:00:00.000Z') })

    expect(await leadRepository(db).list()).toHaveLength(2)
  })

  it('n’enregistre jamais l’adresse IP en clair', async () => {
    const hash = hashIp('41.248.12.7', 'un-secret')
    expect(hash).not.toBeNull()
    expect(hash).not.toContain('41.248')
    expect(hash).toHaveLength(16)

    // Salé : le même IP donne un condensé différent sous un autre secret.
    expect(hashIp('41.248.12.7', 'un-autre-secret')).not.toBe(hash)

    await recordLead(db, payload(), { ipHash: hash, now: NOW })
    const stored = (await leadRepository(db).list())[0]
    expect(stored?.ipHash).toBe(hash)
  })

  it('compte les prospects jamais rappelés, et les décompte au rappel', async () => {
    await recordLead(db, payload(), { ipHash: null, now: NOW })
    const repository = leadRepository(db)
    expect(await repository.countNew()).toBe(1)

    const lead = (await repository.list())[0]
    expect(await repository.markContacted(lead!.id, '2026-08-25')).toBe(true)
    expect(await repository.countNew()).toBe(0)
  })

  /**
   * Un prospect enregistré est acquis. Un prestataire de courriel en panne ne doit
   * pas le perdre — l'envoi est hors du chemin de réponse.
   */
  it('enregistre le prospect même si l’avertissement échoue', async () => {
    process.env['LEADS_NOTIFY_EMAIL'] = 'moi@example.ma'
    setNotifier({ id: 'cassé', send: () => Promise.reject(new Error('SMTP indisponible')) })

    await expect(
      recordLead(db, payload(), { ipHash: null, now: NOW }),
    ).resolves.toEqual({ ok: true })
    expect(await leadRepository(db).list()).toHaveLength(1)

    delete process.env['LEADS_NOTIFY_EMAIL']
  })
})

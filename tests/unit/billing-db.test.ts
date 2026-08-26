import { beforeEach, describe, expect, it } from 'vitest'

import { isConsecutive } from '~/core/billing'
import type { Db } from '~/db/client'
import { invoiceRepository, recordPaymentEvent } from '~/db/repositories/billing'
import { vehicleRepository } from '~/db/repositories/vehicles'
import { organizations } from '~/db/schema/auth'
import { applySubscriptionStatus, issueSubscriptionInvoice, settleInvoice } from '~/server/billing-admin'
import { ensurePlanFeatures, ensurePlans } from '~/server/plan'
import { QuotaExceededError, assertQuota } from '~/server/quota'
import { readBillingOverview } from '~/server/reads/billing'
import { createTestDb, tenant } from '../helpers/db'

/**
 * ABONNEMENT ET FACTURATION, contre une vraie base.
 *
 * Ce que ce fichier prouve et qu'aucun test pur ne peut prouver : que la série de
 * numéros reste sans trou en base, qu'un quota refuse réellement l'écriture, et qu'un
 * impayé finit par retirer le droit d'écrire.
 */

const ALPHA = tenant('org-alpha', { planCode: 'starter' })
const BRAVO = tenant('org-bravo', { planCode: 'starter' })

let db: Db

/** Une organisation, telle que la plateforme la crée. */
async function organisation(id: string, planCode = 'starter'): Promise<void> {
  await db.insert(organizations).values({
    id,
    name: `Org ${id}`,
    slug: id,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    planCode,
    status: 'active',
  })
}

beforeEach(async () => {
  db = createTestDb()
  await ensurePlans(db)
  await ensurePlanFeatures(db)
  await organisation('org-alpha')
  await organisation('org-bravo')
})

describe('numérotation des factures', () => {
  it('attribue une série continue, sans trou', async () => {
    const numbers: string[] = []
    for (let index = 0; index < 5; index += 1) {
      const invoice = await issueSubscriptionInvoice(db, {
        orgId: 'org-alpha',
        subtotalCents: 29_900,
      })
      numbers.push(invoice.number!)
    }

    for (let index = 1; index < numbers.length; index += 1) {
      expect(isConsecutive(numbers[index - 1]!, numbers[index]!)).toBe(true)
    }
  })

  /** Chaque organisation a SA série : c'est elle qui émet, invariant 9. */
  it('donne à chaque organisation sa propre série', async () => {
    const alpha = await issueSubscriptionInvoice(db, { orgId: 'org-alpha', subtotalCents: 1_000 })
    const bravo = await issueSubscriptionInvoice(db, { orgId: 'org-bravo', subtotalCents: 1_000 })

    expect(alpha.number).toBe(bravo.number)
    expect(await invoiceRepository(db, BRAVO).list()).toHaveLength(1)
  })

  /**
   * Une facture annulée GARDE son numéro : c'est tout l'intérêt d'annuler plutôt que
   * de supprimer. Le numéro suivant ne le réutilise pas.
   */
  it('ne réattribue pas le numéro d’une facture annulée', async () => {
    const first = await issueSubscriptionInvoice(db, { orgId: 'org-alpha', subtotalCents: 1_000 })
    await invoiceRepository(db, ALPHA).update(first.id, { status: 'void' })

    const second = await issueSubscriptionInvoice(db, { orgId: 'org-alpha', subtotalCents: 1_000 })
    expect(second.number).not.toBe(first.number)
    expect(isConsecutive(first.number!, second.number!)).toBe(true)
  })

  it('calcule la TVA et le total, en centimes', async () => {
    const invoice = await issueSubscriptionInvoice(db, {
      orgId: 'org-alpha',
      subtotalCents: 29_900,
    })
    expect(invoice.vatCents).toBe(5_980)
    expect(invoice.totalCents).toBe(35_880)
    expect(invoice.status).toBe('sent')
  })
})

describe('quotas', () => {
  async function fillFleet(size: number): Promise<void> {
    const vehicles = vehicleRepository(db, ALPHA)
    for (let index = 0; index < size; index += 1) {
      await vehicles.create({ plate: `${30_000 + index} | أ | 6`, make: 'Dacia', model: 'Logan' })
    }
  }

  it('laisse créer jusqu’à la limite de l’offre', async () => {
    await fillFleet(9)
    await expect(assertQuota(db, ALPHA, 'vehicles')).resolves.toBeUndefined()
  })

  /** `starter` : dix véhicules. Le onzième est refusé, et le refus dit pourquoi. */
  it('refuse au-delà, en nommant la limite et l’offre', async () => {
    await fillFleet(10)

    const error = await assertQuota(db, ALPHA, 'vehicles').catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(QuotaExceededError)
    expect(error).toMatchObject({ counter: 'vehicles', current: 10, limit: 10, planCode: 'starter' })
  })

  it('compte le RÉEL, donc un véhicule supprimé rend sa place', async () => {
    await fillFleet(10)
    const vehicles = await vehicleRepository(db, ALPHA).list()
    await vehicleRepository(db, ALPHA).softDelete(vehicles[0]!.id)

    await expect(assertQuota(db, ALPHA, 'vehicles')).resolves.toBeUndefined()
  })

  it('ne voit pas la flotte du voisin', async () => {
    await fillFleet(10)
    await expect(assertQuota(db, BRAVO, 'vehicles')).resolves.toBeUndefined()
  })
})

describe('cycle de vie de l’abonnement', () => {
  it('un règlement rend l’organisation active et repousse le terme', async () => {
    const invoice = await issueSubscriptionInvoice(db, {
      orgId: 'org-alpha',
      subtotalCents: 29_900,
    })

    const settled = await settleInvoice(db, {
      orgId: 'org-alpha',
      invoiceId: invoice.id,
      method: 'transfer',
      paidOn: '2026-08-25',
      months: 1,
    })

    expect(settled?.periodEndOn).toBe('2026-09-25')
    expect(settled?.status).toBe('active')
  })

  /**
   * LE test qui fait exister la règle : un impayé finit par retirer le droit
   * d'écrire. Tant que `organizations.status` n'était pas recalculé, le cycle de vie
   * n'était qu'une fonction pure que personne n'appelait.
   */
  it('bascule en lecture seule après la période de grâce', async () => {
    const invoice = await issueSubscriptionInvoice(db, {
      orgId: 'org-alpha',
      subtotalCents: 29_900,
    })
    await settleInvoice(db, {
      orgId: 'org-alpha',
      invoiceId: invoice.id,
      method: 'transfer',
      paidOn: '2026-06-01',
      months: 1,
    })
    // Terme au 01/07 : grâce jusqu'au 08/07.

    expect(await applySubscriptionStatus(db, 'org-alpha', '2026-07-05')).toBe('past_due')
    expect(await applySubscriptionStatus(db, 'org-alpha', '2026-07-09')).toBe('read_only')

    const rows = await db.select({ status: organizations.status }).from(organizations)
    expect(rows.find((row) => row.status === 'read_only')).toBeDefined()
  })

  /** Une suspension est une décision humaine : le calendrier ne la lève pas. */
  it('ne relève jamais une organisation suspendue', async () => {
    await db.update(organizations).set({ status: 'suspended' })
    expect(await applySubscriptionStatus(db, 'org-alpha', '2026-08-25')).toBe('read_only')
  })
})

describe('vue client', () => {
  it('montre l’offre, la consommation et les factures', async () => {
    await vehicleRepository(db, ALPHA).create({
      plate: '12345 | أ | 6',
      make: 'Dacia',
      model: 'Logan',
    })
    await issueSubscriptionInvoice(db, { orgId: 'org-alpha', subtotalCents: 29_900 })

    const overview = await readBillingOverview(db, ALPHA, '2026-08-25')

    expect(overview.planCode).toBe('starter')
    expect(overview.usage.find((line) => line.counter === 'vehicles')).toMatchObject({
      current: 1,
      limit: 10,
      room: true,
    })
    expect(overview.invoices).toHaveLength(1)
    expect(overview.invoices[0]?.number).toBe('2026-000001')
  })
})

describe('événements de paiement', () => {
  /** L'idempotence est portée par l'index unique `(provider, event_id)`, pas par le code. */
  it('accepte un événement une fois, ignore le rejeu', async () => {
    const event = { provider: 'manual', eventId: 'evt-1', type: 'payment.succeeded' }

    expect((await recordPaymentEvent(db, event)).accepted).toBe(true)
    expect((await recordPaymentEvent(db, event)).accepted).toBe(false)
    expect((await recordPaymentEvent(db, event)).accepted).toBe(false)
  })

  it('distingue deux prestataires portant le même identifiant', async () => {
    expect((await recordPaymentEvent(db, { provider: 'a', eventId: 'x', type: 't' })).accepted).toBe(true)
    expect((await recordPaymentEvent(db, { provider: 'b', eventId: 'x', type: 't' })).accepted).toBe(true)
  })
})

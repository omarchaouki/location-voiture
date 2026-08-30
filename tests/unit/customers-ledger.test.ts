import { beforeEach, describe, expect, it } from 'vitest'

import type { Db } from '~/db/client'
import { contractRepository, customerRepository } from '~/db/repositories/rental'
import type { TenantContext } from '~/db/tenant'
import { readCustomersLedger } from '~/server/reads/customers'
import { countQueries } from '../helpers/queries'
import { createTestDb, tenant } from '../helpers/db'

/**
 * QUI DOIT ENCORE DE L'ARGENT.
 *
 * Le chiffre existait, éparpillé entre un statut par contrat et des encaissements dans
 * une autre table, et se reconstituait à la main dans un carnet. Ce que ces tests
 * protègent, dans l'ordre où une erreur coûte cher :
 *
 *  1. **le solde est CALCULÉ** à partir des encaissements réels, pas lu dans
 *     `contracts.payment_status` — un statut qu'on a oublié de repasser à « payé »
 *     ferait rappeler un client qui ne doit rien, et c'est la façon la plus sûre de
 *     faire cesser d'utiliser un tableau de relance ;
 *  2. **une annulation ne doit rien** : compter son total ferait apparaître des
 *     créances qui n'ont jamais existé ;
 *  3. **un trop-perçu n'efface pas la dette d'un autre** ;
 *  4. **trois requêtes, quelle que soit la taille du fichier client** — c'est
 *     l'interdiction du N+1 de docs/DOMAIN.md §7.
 */

const ATLAS = tenant('org-atlas')
const RIVAGE = tenant('org-rivage')

let db: Db

beforeEach(async () => {
  db = await createTestDb()
})

async function customer(ctx: TenantContext, lastName: string): Promise<string> {
  const created = await customerRepository(db, ctx).insert({
    orgId: ctx.orgId,
    kind: 'individual',
    firstName: 'Client',
    lastName,
    phone: '+212612345678',
  })
  return created.id
}

async function contract(
  ctx: TenantContext,
  values: { reference: string; customerId: string; totalCents: number; status?: string; endAt?: string },
): Promise<string> {
  const created = await contractRepository(db, ctx).insert({
    orgId: ctx.orgId,
    reference: values.reference,
    vehicleId: 'veh',
    customerId: values.customerId,
    plannedStartAt: '2026-08-01T09:00:00.000Z',
    plannedEndAt: values.endAt ?? '2026-08-10T09:00:00.000Z',
    totalCents: values.totalCents,
    status: values.status ?? 'returned',
  })
  return created.id
}

async function payment(ctx: TenantContext, contractId: string, amountCents: number): Promise<void> {
  await contractRepository(db, ctx).payments.insert({
    orgId: ctx.orgId,
    contractId,
    amountCents,
    receivedAt: '2026-08-10T09:00:00.000Z',
  })
}

describe('encaissements par client', () => {
  it('additionne le facturé, l’encaissé et le reste dû', async () => {
    const id = await customer(ATLAS, 'Berrada')
    const first = await contract(ATLAS, { reference: '2026-000001', customerId: id, totalCents: 120_000 })
    await contract(ATLAS, { reference: '2026-000002', customerId: id, totalCents: 80_000 })
    await payment(ATLAS, first, 50_000)

    const ledger = await readCustomersLedger(db, ATLAS)

    expect(ledger.billedCents).toBe(200_000)
    expect(ledger.paidCents).toBe(50_000)
    expect(ledger.outstandingCents).toBe(150_000)
    expect(ledger.outstandingCustomers).toBe(1)
    expect(ledger.rows[0]?.contracts).toBe(2)
  })

  /**
   * Le solde vient des LIGNES d'encaissement, pas du statut résumé.
   *
   * Ici le contrat est marqué « impayé » alors qu'il est intégralement réglé : le
   * client ne doit rien, et on ne l'appelle pas.
   */
  it('ignore le statut de paiement du contrat, qui peut être en retard', async () => {
    const id = await customer(ATLAS, 'Alaoui')
    const contractId = await contractRepository(db, ATLAS)
      .insert({
        orgId: ATLAS.orgId,
        reference: '2026-000010',
        vehicleId: 'veh',
        customerId: id,
        plannedStartAt: '2026-08-01T09:00:00.000Z',
        plannedEndAt: '2026-08-10T09:00:00.000Z',
        totalCents: 90_000,
        status: 'returned',
        paymentStatus: 'unpaid',
      })
      .then((row) => row.id)
    await payment(ATLAS, contractId, 90_000)

    const ledger = await readCustomersLedger(db, ATLAS)
    expect(ledger.outstandingCents).toBe(0)
    expect(ledger.outstandingCustomers).toBe(0)
    expect(ledger.payingCustomers).toBe(1)
  })

  it('ne compte pas un contrat annulé', async () => {
    const id = await customer(ATLAS, 'Chraibi')
    await contract(ATLAS, {
      reference: '2026-000020',
      customerId: id,
      totalCents: 300_000,
      status: 'cancelled',
    })

    const ledger = await readCustomersLedger(db, ATLAS)
    expect(ledger.billedCents).toBe(0)
    // Aucun contrat facturable : le client ne figure pas dans le tableau.
    expect(ledger.rows).toHaveLength(0)
  })

  /**
   * UN TROP-PERÇU NE SE COMPENSE PAS D'UN CLIENT À L'AUTRE.
   *
   * Sans la borne à zéro, la caution encaissée en avance chez l'un viendrait effacer la
   * dette de l'autre, et le total des impayés cesserait d'être ce qu'on peut aller
   * chercher.
   */
  it('borne le solde d’un client à zéro', async () => {
    const avance = await customer(ATLAS, 'Avance')
    const dette = await customer(ATLAS, 'Dette')

    const paid = await contract(ATLAS, { reference: '2026-000030', customerId: avance, totalCents: 50_000 })
    await payment(ATLAS, paid, 80_000)
    await contract(ATLAS, { reference: '2026-000031', customerId: dette, totalCents: 40_000 })

    const ledger = await readCustomersLedger(db, ATLAS)
    expect(ledger.outstandingCents).toBe(40_000)
    expect(ledger.rows.find((row) => row.label.includes('Avance'))?.balanceCents).toBe(0)
  })

  it('classe les plus gros débiteurs en premier', async () => {
    const petit = await customer(ATLAS, 'Petit')
    const gros = await customer(ATLAS, 'Gros')
    await contract(ATLAS, { reference: '2026-000040', customerId: petit, totalCents: 10_000 })
    await contract(ATLAS, { reference: '2026-000041', customerId: gros, totalCents: 90_000 })

    const ledger = await readCustomersLedger(db, ATLAS)
    expect(ledger.rows.map((row) => row.balanceCents)).toEqual([90_000, 10_000])
  })

  it('retient la location la plus récente, celle qu’on cite au téléphone', async () => {
    const id = await customer(ATLAS, 'Idrissi')
    await contract(ATLAS, {
      reference: '2026-000050',
      customerId: id,
      totalCents: 10_000,
      endAt: '2026-07-02T09:00:00.000Z',
    })
    await contract(ATLAS, {
      reference: '2026-000051',
      customerId: id,
      totalCents: 10_000,
      endAt: '2026-08-19T09:00:00.000Z',
    })

    const ledger = await readCustomersLedger(db, ATLAS)
    expect(ledger.rows[0]?.lastRentalOn).toBe('2026-08-19')
  })

  it('ne voit jamais les impayés de l’agence voisine', async () => {
    const chezNous = await customer(ATLAS, 'Nous')
    await contract(ATLAS, { reference: '2026-000060', customerId: chezNous, totalCents: 10_000 })

    const chezEux = await customer(RIVAGE, 'Eux')
    await contract(RIVAGE, { reference: '2026-000060', customerId: chezEux, totalCents: 999_000 })

    const ledger = await readCustomersLedger(db, ATLAS)
    expect(ledger.billedCents).toBe(10_000)
    expect(ledger.rows).toHaveLength(1)
  })

  /**
   * TROIS REQUÊTES, et le nombre ne bouge pas avec le fichier client.
   *
   * Écrite naïvement, cette lecture ferait une requête de contrats et une requête
   * d'encaissements PAR CLIENT. Le test compte, comme pour la liste des véhicules :
   * une interdiction que personne ne vérifie n'est pas une interdiction.
   */
  it('tient en trois requêtes, quel que soit le nombre de clients', async () => {
    for (let index = 0; index < 12; index += 1) {
      const id = await customer(ATLAS, `Client${index}`)
      const contractId = await contract(ATLAS, {
        reference: `2026-0001${String(index).padStart(2, '0')}`,
        customerId: id,
        totalCents: 20_000,
      })
      await payment(ATLAS, contractId, 5_000)
    }

    const counter = countQueries()
    try {
      const ledger = await readCustomersLedger(db, ATLAS)
      expect(counter.count).toBe(3)
      expect(ledger.rows).toHaveLength(12)
    } finally {
      counter.stop()
    }
  })
})

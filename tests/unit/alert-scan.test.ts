import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import type { Db } from '~/db/client'
import { vehicleRepository } from '~/db/repositories/vehicles'
import { documentRepositories } from '~/db/repositories/documents'
import { alerts } from '~/db/schema/alerts'
import { runAlertScan, syncAlerts } from '~/server/alert-scan'
import { evaluateAlerts } from '~/core/alerts'
import { readAlertSnapshot } from '~/server/alert-scan'
import { createTestDb, tenant } from '../helpers/db'

/**
 * Persistance des alertes.
 *
 * Le moteur est prouvé pur ailleurs ; ici on prouve la partie qui casse vraiment en
 * production : relancer le job, réémettre après renouvellement, et refermer ce qui
 * n'a plus lieu d'être.
 */

const ALPHA = tenant('org-alpha')
const BRAVO = tenant('org-bravo')

let db: Db

beforeEach(() => {
  db = createTestDb()
})

async function vehicleWithInsurance(expiresOn: string) {
  const vehicle = await vehicleRepository(db, ALPHA).create({
    plate: '12345 | أ | 6',
    make: 'Dacia',
    model: 'Logan',
    currentKm: 91_340,
  })
  await documentRepositories(db, ALPHA).insurance.insert({
    vehicleId: vehicle.id,
    company: 'Wafa Assurance',
    expiresOn,
    isCurrent: true,
  })
  return vehicle
}

function openAlerts() {
  return db.select().from(alerts).where(eq(alerts.orgId, ALPHA.orgId))
}

describe('idempotence de la persistance', () => {
  /** LE test du moteur : relancer dix fois ne crée rien de plus. */
  it('dix exécutions ne créent qu’une alerte', async () => {
    const soon = inDays(10)
    await vehicleWithInsurance(soon)

    const first = await runAlertScan(db, ALPHA)
    expect(first.created).toBe(1)

    for (let run = 0; run < 9; run += 1) {
      const again = await runAlertScan(db, ALPHA)
      expect(again.created).toBe(0)
      expect(again.refreshed).toBe(1)
    }

    expect(await openAlerts()).toHaveLength(1)
  })

  it('rafraîchit `lastSeenAt` sans créer de doublon', async () => {
    await vehicleWithInsurance(inDays(10))
    await runAlertScan(db, ALPHA)
    const before = (await openAlerts())[0]

    await syncAlerts(
      db,
      ALPHA,
      evaluateAlerts(await readAlertSnapshot(db, ALPHA)),
      '2099-01-01T00:00:00.000Z',
    )

    const after = (await openAlerts())[0]
    expect(after?.id).toBe(before?.id)
    expect(after?.lastSeenAt).toBe('2099-01-01T00:00:00.000Z')
    expect(after?.firstSeenAt).toBe(before?.firstSeenAt)
  })
})

describe('cycle de vie', () => {
  it('referme l’alerte quand la cause disparaît', async () => {
    const vehicle = await vehicleWithInsurance(inDays(10))
    await runAlertScan(db, ALPHA)
    expect((await openAlerts())[0]?.state).toBe('open')

    // Police renouvelée : la nouvelle échéance est lointaine, plus rien à signaler.
    const documents = documentRepositories(db, ALPHA)
    const current = await documents.currentInsurance(vehicle.id)
    await documents.insurance.update(current!.id, { expiresOn: inDays(400) })

    const second = await runAlertScan(db, ALPHA)
    expect(second.resolved).toBe(1)
    expect((await openAlerts())[0]?.state).toBe('resolved')
  })

  /**
   * É5 — le test qui protège la deuxième année de production : après renouvellement,
   * la MÊME alerte doit pouvoir réapparaître, sur une nouvelle période.
   */
  it('réémet une alerte après renouvellement, sur une période distincte', async () => {
    const vehicle = await vehicleWithInsurance(inDays(10))
    await runAlertScan(db, ALPHA)

    const documents = documentRepositories(db, ALPHA)
    const current = await documents.currentInsurance(vehicle.id)
    // Renouvelée… mais la nouvelle échéance est elle aussi proche.
    await documents.insurance.update(current!.id, { expiresOn: inDays(12) })

    await runAlertScan(db, ALPHA)
    const rows = await openAlerts()

    expect(rows).toHaveLength(2)
    expect(new Set(rows.map((row) => row.periodKey)).size).toBe(2)
    // L'ancienne est close, la nouvelle est ouverte.
    expect(rows.filter((row) => row.state === 'open')).toHaveLength(1)
  })

  it('remplace un seuil par un plus grave sans laisser l’ancien ouvert', async () => {
    const vehicle = await vehicleWithInsurance(inDays(20))
    await runAlertScan(db, ALPHA)
    expect((await openAlerts())[0]?.thresholdKey).toBe('d-30')

    const documents = documentRepositories(db, ALPHA)
    const current = await documents.currentInsurance(vehicle.id)
    await documents.insurance.update(current!.id, { expiresOn: inDays(5) })

    await runAlertScan(db, ALPHA)
    const rows = await openAlerts()
    const open = rows.filter((row) => row.state === 'open')

    expect(open).toHaveLength(1)
    expect(open[0]?.thresholdKey).toBe('d-7')
    // L'historique reste : on ne supprime rien, on referme.
    expect(rows).toHaveLength(2)
  })
})

describe('cloisonnement', () => {
  it('un balayage ne voit jamais les données d’une autre organisation', async () => {
    await vehicleWithInsurance(inDays(10))

    const bravo = await runAlertScan(db, BRAVO)
    expect(bravo.evaluated).toBe(0)
    expect(bravo.created).toBe(0)

    const rows = await db.select().from(alerts).where(eq(alerts.orgId, BRAVO.orgId))
    expect(rows).toHaveLength(0)
  })
})

/** Date civile à N jours d'aujourd'hui, en heure de Casablanca. */
function inDays(days: number): string {
  const date = new Date(Date.now() + days * 86_400_000)
  return date.toISOString().slice(0, 10)
}

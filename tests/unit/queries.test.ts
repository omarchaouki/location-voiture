import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { Db } from '~/db/client'
import { forOrg } from '~/db/repositories/base'
import { gpsDeviceRepository, gpsPositionRepository } from '~/db/repositories/gps'
import { vehicleRepository } from '~/db/repositories/vehicles'
import { alerts } from '~/db/schema/alerts'
import { readFleetSnapshot } from '~/server/reads/fleet'
import { ensurePlanFeatures } from '~/server/plan'
import { readVehicleList } from '~/server/reads/vehicles'
import { createTestDb, tenant } from '../helpers/db'
import { countQueries, type QueryCounter } from '../helpers/queries'

/**
 * LE test de N+1.
 *
 * Le cahier des charges l'exige nommément (docs/DOMAIN.md §7) : « un test de
 * performance comptera les requêtes ». Ce fichier est ce test.
 *
 * Sa forme compte autant que son contenu. On ne vérifie pas qu'une lecture est
 * « rapide » — une mesure de durée dépend de la machine et finit désactivée. On
 * vérifie que le nombre d'allers-retours avec la base **ne dépend pas du nombre de
 * lignes affichées**. C'est vrai ou faux, et ça le reste sur n'importe quelle machine.
 */

const ALPHA = tenant('org-alpha')
const NOW = Date.parse('2026-08-24T12:00:00.000Z')

let db: Db
let counter: QueryCounter
/** Compteur de plaques : deux appels successifs ne doivent pas se marcher dessus. */
let plateSeed = 0

beforeEach(async () => {
  db = createTestDb()
  plateSeed = 0
  await ensurePlanFeatures(db)
})

afterEach(() => {
  counter.stop()
})

/** Une flotte de `size` voitures, chacune avec une échéance ouverte. */
async function fleet(size: number): Promise<void> {
  const vehicles = vehicleRepository(db, ALPHA)
  const alertRepository = forOrg<typeof alerts.$inferSelect>(db, ALPHA, alerts)

  for (let index = 0; index < size; index += 1) {
    plateSeed += 1
    const vehicle = await vehicles.create({
      plate: `${10_000 + plateSeed} | أ | 6`,
      make: 'Dacia',
      model: 'Logan',
    })

    await alertRepository.insert({
      entityType: 'vehicle',
      entityId: vehicle.id,
      alertType: 'insurance.expiry',
      thresholdKey: 'd-30',
      periodKey: '2026-09-20',
      severity: 'critical',
      dueOn: '2026-09-20',
      state: 'open',
      firstSeenAt: '2026-08-24T08:00:00.000Z',
      lastSeenAt: '2026-08-24T08:00:00.000Z',
    })
  }
}

describe('liste des véhicules', () => {
  it('lit la flotte ET ses échéances en deux requêtes, quelle que soit sa taille', async () => {
    await fleet(1)
    counter = countQueries(db)

    const small = await readVehicleList(db, ALPHA)
    const forOneVehicle = counter.count
    expect(small).toHaveLength(1)
    expect(forOneVehicle).toBe(2)

    // Quarante voitures : c'est une flotte de loueur marocain ordinaire.
    counter.stop()
    await fleet(39)
    counter = countQueries(db)

    const large = await readVehicleList(db, ALPHA)
    expect(large).toHaveLength(40)

    // LE point du test : le même nombre de requêtes. Une lecture par ligne donnerait 41.
    expect(counter.count).toBe(forOneVehicle)
  })

  it('affiche l’échéance LA PLUS GRAVE, pas la première venue', async () => {
    const vehicle = await vehicleRepository(db, ALPHA).create({
      plate: '12345 | أ | 6',
      make: 'Dacia',
      model: 'Logan',
    })
    const alertRepository = forOrg<typeof alerts.$inferSelect>(db, ALPHA, alerts)

    await alertRepository.insert({
      entityType: 'vehicle',
      entityId: vehicle.id,
      alertType: 'maintenance.due',
      thresholdKey: 'km-500',
      periodKey: '2026-10-01',
      severity: 'high',
      dueOn: '2026-10-01',
      state: 'open',
      firstSeenAt: '2026-08-24T08:00:00.000Z',
      lastSeenAt: '2026-08-24T08:00:00.000Z',
    })
    await alertRepository.insert({
      entityType: 'vehicle',
      entityId: vehicle.id,
      alertType: 'insurance.expiry',
      thresholdKey: 'overdue',
      periodKey: '2026-08-01',
      severity: 'critical',
      dueOn: '2026-08-01',
      state: 'open',
      firstSeenAt: '2026-08-24T08:00:00.000Z',
      lastSeenAt: '2026-08-24T08:00:00.000Z',
    })

    counter = countQueries(db)
    const rows = await readVehicleList(db, ALPHA)
    expect(rows[0]?.nextDeadline?.alertType).toBe('insurance.expiry')
  })

  it('ignore une échéance déjà traitée', async () => {
    const vehicle = await vehicleRepository(db, ALPHA).create({
      plate: '27819 | ب | 1',
      make: 'Hyundai',
      model: 'i10',
    })
    await forOrg<typeof alerts.$inferSelect>(db, ALPHA, alerts).insert({
      entityType: 'vehicle',
      entityId: vehicle.id,
      alertType: 'insurance.expiry',
      thresholdKey: 'd-30',
      periodKey: '2026-09-20',
      severity: 'critical',
      dueOn: '2026-09-20',
      state: 'acknowledged',
      firstSeenAt: '2026-08-24T08:00:00.000Z',
      lastSeenAt: '2026-08-24T08:00:00.000Z',
    })

    counter = countQueries(db)
    const rows = await readVehicleList(db, ALPHA)
    expect(rows[0]?.nextDeadline).toBeNull()
  })
})

describe('carte de la flotte', () => {
  it('reste à nombre de requêtes constant quand la flotte grossit', async () => {
    async function equip(size: number): Promise<void> {
      const devices = gpsDeviceRepository(db, ALPHA)
      const positions = gpsPositionRepository(db, ALPHA)
      const vehicles = vehicleRepository(db, ALPHA)

      for (let index = 0; index < size; index += 1) {
        plateSeed += 1
        const vehicle = await vehicles.create({
          plate: `${20_000 + plateSeed} | ب | 2`,
          make: 'Renault',
          model: 'Clio',
        })
        const device = await devices.insert({
          vehicleId: vehicle.id,
          provider: 'mock',
          externalId: `IMEI-${plateSeed}`,
          isActive: true,
        })
        await positions.ingest([
          {
            deviceId: device.id,
            recordedAt: '2026-08-24T11:50:00.000Z',
            lat: 33.5945,
            lng: -7.6167,
            speedKmh: 40,
          },
        ])
      }
    }

    await equip(1)
    counter = countQueries(db)
    const small = await readFleetSnapshot(db, ALPHA, NOW)
    const forOneVehicle = counter.count
    expect(small.locked).toBe(false)

    counter.stop()
    await equip(39)
    counter = countQueries(db)

    const large = await readFleetSnapshot(db, ALPHA, NOW)
    expect(large.locked).toBe(false)
    if (large.locked) return
    expect(large.positions).toHaveLength(40)

    // Quarante boîtiers, autant de requêtes qu'un seul.
    expect(counter.count).toBe(forOneVehicle)
  })
})

describe('le compteur lui-même', () => {
  /**
   * Un compteur qui ne compte rien ferait passer tous les tests ci-dessus. On le
   * met donc en échec volontairement : une boucle DOIT être vue comme un N+1.
   */
  it('voit un N+1 quand il y en a un', async () => {
    await fleet(5)
    counter = countQueries(db)

    const vehicles = vehicleRepository(db, ALPHA)
    const rows = await vehicles.list()
    const before = counter.count

    // La forme interdite : une lecture par ligne.
    for (const row of rows) await vehicles.findById(row.id)

    expect(counter.count - before).toBe(rows.length)
  })
})

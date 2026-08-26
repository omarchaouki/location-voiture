import { beforeEach, describe, expect, it } from 'vitest'
import { getTableName, type Table } from 'drizzle-orm'

import type { Db } from '~/db/client'
import { forOrg, type OrgScopedTable } from '~/db/repositories/base'
import { vehicleRepository } from '~/db/repositories/vehicles'
import * as schema from '~/db/schema'
import { ReadOnlyError } from '~/db/tenant'
import { createTestDb, tenant } from '../helpers/db'

/**
 * LE test du projet.
 *
 * Tant qu'on est sur SQLite, aucun RLS ne protège les données : la seule barrière
 * entre deux clients est la couche repository. Ce fichier existe pour que cette
 * barrière soit prouvée à chaque exécution, pas supposée.
 *
 * Il est piloté par un REGISTRE déduit du schéma : toute nouvelle table portant
 * `org_id` entre automatiquement dans la boucle. Ajouter une entité sans son test
 * devient impossible — c'est le point du cahier des charges §4.
 */

const ALPHA = tenant('org-alpha')
const BRAVO = tenant('org-bravo')

/**
 * Les tables de plateforme portent un `org_id` NULLABLE (journal d'audit, prospects,
 * drapeaux) : elles ne sont pas cloisonnées de la même manière et ont leurs propres
 * règles d'accès dans /admin.
 */
const NOT_ORG_SCOPED = new Set(['audit_log', 'leads', 'feature_flags'])

/** Toutes les tables cloisonnées, déduites du schéma lui-même. */
function orgScopedTables(): Array<{ name: string; table: OrgScopedTable }> {
  const found: Array<{ name: string; table: OrgScopedTable }> = []

  for (const value of Object.values(schema) as ReadonlyArray<unknown>) {
    if (typeof value !== 'object' || value === null) continue
    if (!('getSQL' in value)) continue

    const columns = value as { orgId?: unknown; deletedAt?: unknown; id?: unknown }
    if (!columns.orgId || !columns.deletedAt || !columns.id) continue

    const name = getTableName(value as Table)
    if (NOT_ORG_SCOPED.has(name)) continue

    found.push({ name, table: value as unknown as OrgScopedTable })
  }

  return found
}

let db: Db

beforeEach(() => {
  db = createTestDb()
})

describe('registre des tables cloisonnées', () => {
  it('couvre les entités métier attendues', () => {
    const names = orgScopedTables().map((entry) => entry.name)
    for (const expected of [
      'vehicles',
      'customers',
      'contracts',
      'insurance_policies',
      'technical_inspections',
      'road_taxes',
      'permits',
      'maintenance_schedules',
      'fines',
      'expenses',
      'revenues',
      'alerts',
      'gps_positions',
      'vehicle_daily_km',
    ]) {
      expect(names).toContain(expected)
    }
  })
})

describe.each(orgScopedTables())('cloisonnement — $name', ({ table }) => {
  const alpha = () => forOrg<Record<string, unknown>>(db, ALPHA, table)
  const bravo = () => forOrg<Record<string, unknown>>(db, BRAVO, table)

  /** Valeurs minimales : les colonnes NOT NULL sans défaut, remplies génériquement. */
  function minimalRow(): Record<string, unknown> {
    const columns = (table as unknown as { [key: string]: unknown })
    const row: Record<string, unknown> = {}
    for (const [key, column] of Object.entries(columns)) {
      if (typeof column !== 'object' || column === null) continue
      const meta = column as { notNull?: boolean; hasDefault?: boolean; columnType?: string; name?: string }
      if (!meta.notNull || meta.hasDefault) continue
      if (key === 'id' || key === 'orgId') continue
      row[key] = meta.columnType?.includes('Integer') || meta.columnType?.includes('Real')
        ? 1
        : `v-${key}`
    }
    return row
  }

  it('une ligne d’Alpha est invisible pour Bravo', async () => {
    const created = await alpha().insert(minimalRow())
    const id = created['id'] as string

    expect(await alpha().findById(id)).toBeDefined()
    // 404 et non 403 : l'appelant ne peut même pas savoir que la ligne existe.
    expect(await bravo().findById(id)).toBeUndefined()
    expect(await bravo().list()).toHaveLength(0)
    expect(await bravo().count()).toBe(0)
  })

  it('Bravo ne peut pas modifier une ligne d’Alpha', async () => {
    const created = await alpha().insert(minimalRow())
    const id = created['id'] as string

    expect(await bravo().update(id, { updatedAt: '2000-01-01T00:00:00.000Z' })).toBeUndefined()
    expect(await alpha().findById(id)).toBeDefined()
  })

  it('Bravo ne peut pas supprimer une ligne d’Alpha', async () => {
    const created = await alpha().insert(minimalRow())
    const id = created['id'] as string

    expect(await bravo().softDelete(id)).toBe(false)
    expect(await alpha().findById(id)).toBeDefined()
  })

  it('un `orgId` glissé dans la charge utile est ignoré', async () => {
    // Tentative classique : envoyer l'identifiant d'une autre organisation dans le corps.
    const created = await alpha().insert({ ...minimalRow(), orgId: BRAVO.orgId })
    expect(created['orgId']).toBe(ALPHA.orgId)
    expect(await bravo().list()).toHaveLength(0)
  })

  it('une ligne supprimée disparaît des lectures mais reste restaurable', async () => {
    const created = await alpha().insert(minimalRow())
    const id = created['id'] as string

    expect(await alpha().softDelete(id)).toBe(true)
    expect(await alpha().findById(id)).toBeUndefined()
    expect(await alpha().restore(id)).toBe(true)
    expect(await alpha().findById(id)).toBeDefined()
  })

  it('un contexte en lecture seule refuse toute écriture', async () => {
    const readOnly = forOrg<Record<string, unknown>>(
      db,
      tenant('org-alpha', { canWrite: false }),
      table,
    )
    await expect(readOnly.insert(minimalRow())).rejects.toBeInstanceOf(ReadOnlyError)
  })
})

describe('repository des véhicules', () => {
  it('normalise la plaque et fait respecter son unicité par organisation', async () => {
    const alpha = vehicleRepository(db, ALPHA)
    const bravo = vehicleRepository(db, BRAVO)

    await alpha.create({ plate: '12345 | أ | 6', make: 'Dacia', model: 'Logan' })

    // Même plaque saisie autrement : c'est un doublon, l'index unique doit sauter.
    await expect(
      alpha.create({ plate: '12345 A 6', make: 'Dacia', model: 'Sandero' }),
    ).rejects.toThrow()

    // La même plaque chez un AUTRE loueur est parfaitement légitime.
    await expect(
      bravo.create({ plate: '12345 A 6', make: 'Renault', model: 'Clio' }),
    ).resolves.toBeDefined()
  })

  it('retrouve un véhicule quelle que soit la forme de la plaque saisie', async () => {
    const alpha = vehicleRepository(db, ALPHA)
    await alpha.create({ plate: '27819 | ب | 1', make: 'Hyundai', model: 'i10' })

    expect(await alpha.findByPlate('27819 B 1')).toBeDefined()
    expect(await alpha.findByPlate('27819-ب-1')).toBeDefined()
    // …et jamais celui du voisin.
    expect(await vehicleRepository(db, BRAVO).findByPlate('27819 B 1')).toBeUndefined()
  })

  it('refuse une plaque non marocaine plutôt que de l’enregistrer telle quelle', async () => {
    const alpha = vehicleRepository(db, ALPHA)
    await expect(alpha.create({ plate: 'AB-123-CD', make: 'Peugeot', model: '208' })).rejects.toThrow()
  })
})

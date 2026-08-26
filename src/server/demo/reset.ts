import { eq, getTableName, type Table } from 'drizzle-orm'

import type { Db } from '~/db/client'
import * as schema from '~/db/schema'
import { systemContext } from '../system-context'
import { seedDemoOrganization } from './seed'
import { businessCivilDate } from '~/i18n/format'
import { organizations } from '~/db/schema/auth'

/**
 * RÉINITIALISATION des organisations de démonstration.
 *
 * Le choix a été posé en Phase 0 (docs/DECISIONS.md É10) : **deux espaces partagés,
 * remis à zéro chaque nuit**, plutôt qu'une copie par visiteur. Une copie par visiteur
 * demande un provisionnement à la volée — création, seed, expiration, nettoyage — et
 * sur SQLite un fichier par visiteur. Coût assumé du choix retenu : deux visiteurs
 * simultanés se voient mutuellement, et l'écran le dit.
 *
 * **La purge est une suppression DURE, et c'est la deuxième du produit** (après celle
 * des positions GPS, §13.5). La charte l'autorise « hors purges documentées » : en
 * voici une, documentée ici. Un effacement doux ne conviendrait pas — les lignes
 * s'accumuleraient nuit après nuit, une agence entière par jour, jusqu'à noyer la base
 * de démonstration sous des mois de données invisibles.
 *
 * La liste des tables à vider est **déduite du schéma**, jamais écrite à la main :
 * toute nouvelle table cloisonnée est purgée automatiquement. Une table oubliée
 * laisserait des données d'un visiteur visibles par le suivant, ce qui est exactement
 * ce que la réinitialisation existe pour empêcher.
 */

/** Slugs des deux espaces partagés. Ils font foi : la démo se reconnaît à eux. */
export const DEMO_SLUGS = ['demo-atlas', 'demo-sahara'] as const

interface OrgScopedTable extends Table {
  orgId: { name: string }
}

/** Toutes les tables portant `org_id`, déduites du schéma comme dans le test d'isolation. */
function orgScopedTables(): Array<{ name: string; table: OrgScopedTable }> {
  const found: Array<{ name: string; table: OrgScopedTable }> = []

  for (const value of Object.values(schema) as ReadonlyArray<unknown>) {
    if (typeof value !== 'object' || value === null) continue
    if (!('getSQL' in value)) continue

    const columns = value as { orgId?: unknown }
    if (!columns.orgId) continue

    found.push({ name: getTableName(value as Table), table: value as OrgScopedTable })
  }

  return found
}

export interface ResetResult {
  organizations: number
  tablesCleared: number
  seeded: number
}

/**
 * Vide puis recompose une organisation de démonstration.
 *
 * L'ordre compte : on vide TOUT avant de réécrire, sinon un identifiant de véhicule
 * survivant ferait référence à un contrat effacé.
 */
export async function resetDemoOrganization(
  db: Db,
  orgId: string,
  planCode: string,
  today = businessCivilDate(new Date()),
): Promise<{ tablesCleared: number }> {
  const tables = orgScopedTables()

  for (const entry of tables) {
    /*
     * `audit_log` est épargné : c'est le journal de la plateforme, pas une donnée de
     * l'agence de démonstration. L'effacer reviendrait à perdre la trace des actes
     * d'administration qui ont porté sur elle.
     */
    if (entry.name === 'audit_log') continue
    await db.delete(entry.table).where(eq(entry.table.orgId as never, orgId))
  }

  await seedDemoOrganization(db, systemContext(orgId, planCode), today)
  return { tablesCleared: tables.length }
}

/** Réinitialise les deux espaces partagés. Appelée par `pnpm demo:reset` et par le cron. */
export async function resetAllDemoOrganizations(
  db: Db,
  today = businessCivilDate(new Date()),
): Promise<ResetResult> {
  const rows = await db
    .select({ id: organizations.id, planCode: organizations.planCode, slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.isDemo, true))

  const result: ResetResult = { organizations: 0, tablesCleared: 0, seeded: 0 }

  for (const row of rows) {
    const cleared = await resetDemoOrganization(db, row.id, row.planCode, today)
    result.organizations += 1
    result.tablesCleared = cleared.tablesCleared
    result.seeded += 1
  }

  return result
}

import { eq, getTableName, sql, type Table } from 'drizzle-orm'

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
 * CE QU'ON EFFACE, et c'est à l'appelant de le dire.
 *
 *  - `everything` : tout ce qui porte l'`org_id`. C'est le geste de la
 *    réinitialisation nocturne, sur des espaces qui n'appartiennent à personne.
 *  - `agency-data` : les données de l'AGENCE — voitures, clients, contrats, pièces,
 *    amendes, alertes, GPS — mais pas l'appareillage du COMPTE.
 *
 * Il n'y a pas de valeur par défaut, volontairement. Le jour où une table s'ajoute
 * entre les deux catégories, c'est ici qu'il faudra trancher, pas dans un appelant.
 */
export type PurgeScope = 'everything' | 'agency-data'

/**
 * Ce qu'une purge d'agence ÉPARGNE, et pourquoi chacune y est.
 *
 * Ces tables portent bien un `org_id`, mais elles ne décrivent pas l'activité de
 * l'agence : elles décrivent son compte. Les effacer en même temps que la flotte
 * laisserait une organisation vivante, connectée, et sans abonnement — un état que
 * rien dans le produit ne sait rattraper.
 */
const ACCOUNT_TABLES: ReadonlyMap<string, string> = new Map([
  ['subscriptions', "l'abonnement : sans lui, plus d'offre, plus de fin d'essai, plus de facturation"],
  ['impersonation_sessions', 'acte de plateforme, pas donnée du client'],
])

/**
 * EFFACE ce qu'une organisation possède, table par table.
 *
 * Suppression DURE, et assumée : voir l'en-tête de ce module. Elle sert deux appelants
 * — la réinitialisation nocturne des espaces partagés, et la commande `pnpm demo:purge`
 * qui rend un compte à son état vide. Un seul chemin, donc un seul comportement à
 * connaître, et une seule liste de tables à tenir à jour : celle que le schéma déduit.
 *
 * Elle ne regarde PAS `is_demo` : c'est l'appelant qui décide de la cible, et qui doit
 * la nommer. Un garde ici donnerait l'illusion d'une protection que la fonction ne peut
 * pas offrir — elle ne sait pas ce que l'appelant croit effacer.
 */
export async function purgeOrganizationData(
  db: Db,
  orgId: string,
  scope: PurgeScope,
): Promise<{ tablesCleared: number }> {
  const tables = orgScopedTables().filter((entry) => purges(entry.name, scope))

  for (const entry of tables) {
    await db.delete(entry.table).where(eq(entry.table.orgId as never, orgId))
  }

  return { tablesCleared: tables.length }
}

/** Les tables qu'une purge vide. Pour les annoncer avant d'agir. */
export function purgeableTableNames(scope: PurgeScope): string[] {
  return orgScopedTables()
    .filter((entry) => purges(entry.name, scope))
    .map((entry) => entry.name)
    .sort()
}

/**
 * Les noms comparés ici sont ceux de la BASE (`impersonation_sessions`), pas les clés
 * d'export du schéma (`impersonationSessions`) : `orgScopedTables()` passe par
 * `getTableName()`. Les deux conventions cohabitent dans le projet, et les confondre
 * ferait échouer la comparaison en silence — donc épargner zéro table.
 */
function purges(table: string, scope: PurgeScope): boolean {
  /*
   * `audit_log` est épargné dans TOUS les cas : c'est le journal de la plateforme, pas
   * une donnée de l'agence. L'effacer reviendrait à perdre la trace des actes
   * d'administration qui ont porté sur elle.
   */
  if (table === 'audit_log') return false
  if (scope === 'everything') return true
  return !ACCOUNT_TABLES.has(table)
}

/**
 * Ce qu'une organisation possède, table par table — seulement les tables NON VIDES.
 *
 * Elle existe pour une seule raison : qu'une commande destructive puisse dire ce
 * qu'elle s'apprête à effacer AVANT de l'effacer. Un « 412 lignes vont disparaître »
 * arrête une main ; un « êtes-vous sûr ? » ne l'arrête pas.
 */
export async function countOrganizationRows(
  db: Db,
  orgId: string,
  scope: PurgeScope,
): Promise<{ total: number; byTable: Record<string, number> }> {
  const byTable: Record<string, number> = {}
  let total = 0

  // Le décompte suit la MÊME portée que la purge : annoncer une ligne qu'on n'effacera
  // pas, ou taire celle qu'on efface, rendrait l'avertissement pire qu'inutile.
  for (const entry of orgScopedTables()) {
    if (!purges(entry.name, scope)) continue

    const rows = await db
      .select({ value: sql<number>`count(*)` })
      .from(entry.table)
      .where(eq(entry.table.orgId as never, orgId))

    const value = Number(rows[0]?.value ?? 0)
    if (value > 0) {
      byTable[entry.name] = value
      total += value
    }
  }

  return { total, byTable }
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
  // `everything` : ces espaces n'appartiennent à personne, et la nuit les rend neufs.
  const cleared = await purgeOrganizationData(db, orgId, 'everything')
  await seedDemoOrganization(db, systemContext(orgId, planCode), today)
  return cleared
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

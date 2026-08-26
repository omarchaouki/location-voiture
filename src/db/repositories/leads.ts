import { and, desc, eq, isNull } from 'drizzle-orm'

import type { Db } from '~/db/client'
import { nowIso } from '~/db/schema/_shared'
import { leads } from '~/db/schema/platform'

/**
 * PROSPECTS — table de plateforme, sans `org_id`.
 *
 * Une demande de démonstration arrive d'un inconnu : elle n'appartient encore à
 * aucune organisation, et elle ne relève donc pas du cloisonnement. Elle relève de
 * moi, comme le journal d'audit. C'est la raison pour laquelle ce repository ne
 * prend pas de `TenantContext` — et la seule.
 *
 * La table existait depuis la Phase 1 et **personne n'écrivait dedans**. Un
 * formulaire qui écrit dans une table que personne ne lit ne vaut pas mieux : la
 * liste est donc affichée dans `/admin`, dans la même livraison.
 */

export type LeadRow = typeof leads.$inferSelect

export interface LeadInsert {
  name: string
  phone: string
  company?: string | null
  email?: string | null
  city?: string | null
  fleetSize?: string | null
  message?: string | null
  source?: string | null
  locale: string
  ipHash?: string | null
  /**
   * Horodatage de création, en ISO 8601 UTC.
   *
   * Facultatif, et il ne l'est que pour UNE raison : la déduplication par numéro
   * compare `created_at` à une borne calculée depuis l'horloge que l'appelant lui
   * injecte (`recordLead`). Tant que l'insertion posait l'heure RÉELLE, les deux
   * horloges divergeaient et la règle « un même numéro le lendemain crée bien un
   * second prospect » devenait vraie ou fausse selon l'heure qu'il était — le test
   * correspondant passait le matin et échouait l'après-midi.
   *
   * Omis, le défaut du schéma s'applique : c'est le cas de tout le produit.
   */
  createdAt?: string
}

export function leadRepository(db: Db) {
  return {
    async create(values: LeadInsert): Promise<LeadRow> {
      const rows = await db
        .insert(leads)
        .values({
          name: values.name,
          phone: values.phone,
          company: values.company ?? null,
          email: values.email ?? null,
          city: values.city ?? null,
          fleetSize: values.fleetSize ?? null,
          message: values.message ?? null,
          source: values.source ?? null,
          locale: values.locale,
          ipHash: values.ipHash ?? null,
          status: 'new',
          // Omis = le `$defaultFn` du schéma pose l'heure réelle.
          ...(values.createdAt ? { createdAt: values.createdAt } : {}),
        })
        .returning()

      const row = rows[0]
      if (!row) throw new Error('lead not created')
      return row
    },

    /**
     * Un même numéro qui redemande une démonstration dans la journée ne crée pas un
     * second prospect. Ce n'est pas une limitation de débit — celle-là se pose plus
     * bas — c'est une règle de contenu : rappeler deux fois la même personne le même
     * jour n'aide personne.
     */
    async recentByPhone(phone: string, sinceIso: string): Promise<LeadRow | undefined> {
      const rows = await db
        .select()
        .from(leads)
        .where(and(eq(leads.phone, phone), isNull(leads.deletedAt)))
        .orderBy(desc(leads.createdAt))
        .limit(1)

      const latest = rows[0]
      return latest && latest.createdAt >= sinceIso ? latest : undefined
    },

    async list(limit = 50): Promise<LeadRow[]> {
      return db
        .select()
        .from(leads)
        .where(isNull(leads.deletedAt))
        .orderBy(desc(leads.createdAt))
        .limit(limit)
    },

    async countNew(): Promise<number> {
      const rows = await db
        .select({ id: leads.id })
        .from(leads)
        .where(and(eq(leads.status, 'new'), isNull(leads.deletedAt)))
      return rows.length
    },

    async markContacted(id: string, onCivilDate: string): Promise<boolean> {
      const rows = await db
        .update(leads)
        .set({ status: 'contacted', contactedOn: onCivilDate, updatedAt: nowIso() })
        .where(and(eq(leads.id, id), isNull(leads.deletedAt)))
        .returning({ id: leads.id })
      return rows.length > 0
    },
  }
}

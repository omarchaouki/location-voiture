import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm'

import { nextInvoiceNumber } from '~/core/billing'
import type { Db } from '../client'
import { nowIso } from '../schema/_shared'
import { invoices, paymentEvents, subscriptions, usageCounters } from '../schema/billing'
import { assertCanWrite, withTenant, type TenantContext } from '../tenant'
import { forOrg } from './base'

/**
 * Repositories de l'abonnement et de la facturation.
 *
 * La pièce délicate est l'attribution du numéro de facture : c'est une obligation
 * légale (docs/DOMAIN.md, invariant 9), pas une commodité d'affichage.
 */

export type SubscriptionRow = typeof subscriptions.$inferSelect
export type InvoiceRow = typeof invoices.$inferSelect
export type UsageCounterRow = typeof usageCounters.$inferSelect

export function subscriptionRepository(db: Db, ctx: TenantContext) {
  const base = forOrg<SubscriptionRow>(db, ctx, subscriptions)

  return {
    ...base,
    /** L'abonnement courant. Une organisation n'en a qu'un vivant à la fois. */
    async current(): Promise<SubscriptionRow | undefined> {
      const rows = await base.list()
      return rows[0]
    },
  }
}

/** Levée quand la séquence de numéros n'a pas pu être attribuée. Jamais silencieuse. */
export class InvoiceNumberingError extends Error {
  constructor(readonly attempts: number) {
    super(`invoice numbering failed after ${attempts} attempts`)
    this.name = 'InvoiceNumberingError'
  }
}

/** Au-delà, c'est que quelque chose d'autre ne va pas : on lève au lieu de boucler. */
const MAX_NUMBERING_ATTEMPTS = 5

/**
 * Conflit d'unicité — reconnu par son CODE, jamais par son texte.
 *
 * La version précédente cherchait « unique » dans `String(error)`. Elle marchait sur
 * SQLite, dont le message est `UNIQUE constraint failed: …`. Postgres n'a pas le même
 * message, et surtout Drizzle enveloppe l'erreur du pilote : le message extérieur est
 * « Failed query: update "invoices" … », où le mot « unique » n'apparaît nulle part.
 * Résultat, la boucle de réessai ne se déclenchait plus et la deuxième facture d'une
 * série échouait — une obligation de facturation cassée par une comparaison de chaînes.
 *
 * `23505` est le SQLSTATE normalisé de la violation d'unicité. Il ne dépend ni de la
 * langue du serveur, ni de la version, ni de l'emballage de l'ORM. On remonte la chaîne
 * des `cause` parce que c'est là que Drizzle range l'erreur du pilote.
 */
function isUniqueViolation(error: unknown): boolean {
  for (let current = error; current != null; current = (current as { cause?: unknown }).cause) {
    if (typeof current !== 'object') break
    if ((current as { code?: unknown }).code === '23505') return true
  }
  return false
}

export function invoiceRepository(db: Db, ctx: TenantContext) {
  const base = forOrg<InvoiceRow>(db, ctx, invoices)

  return {
    ...base,

    /**
     * Dernier numéro attribué pour une année.
     *
     * On lit le MAXIMUM, jamais un `count()` : une facture annulée (`void`) garde son
     * numéro — c'est même tout l'intérêt d'annuler plutôt que de supprimer — et
     * compter les lignes réattribuerait un numéro déjà utilisé.
     *
     * La lecture ignore volontairement `deleted_at` : un numéro consommé l'est pour
     * toujours, même si la ligne venait à être masquée.
     */
    async lastNumber(year: number): Promise<string | null> {
      const rows = await withTenant(db, ctx, async (tx) =>
        tx
          .select({ number: invoices.number })
          .from(invoices)
          /*
           * `is not null` n'est PAS une précaution décorative.
           *
           * Une facture en brouillon n'a pas encore de numéro. Postgres trie les NULL en
           * PREMIER dans un `order by … desc` (`NULLS FIRST` y est le défaut), là où
           * SQLite les met en dernier : le premier brouillon venu prenait la tête, le
           * « dernier numéro » était lu comme nul, et la série repartait à 000001 à
           * chaque émission. La boucle de réessai tournait alors cinq fois sur le même
           * numéro avant d'abandonner. Découvert à la bascule Postgres du 28/08/2026.
           *
           * Filtrer dit d'ailleurs mieux l'intention que `nulls last` : ce qu'on cherche,
           * c'est le dernier numéro CONSOMMÉ, et un brouillon n'en consomme aucun.
           */
          .where(and(eq(invoices.orgId, ctx.orgId), isNotNull(invoices.number)))
          .orderBy(desc(invoices.number))
          .limit(1),
      )

      const last = rows[0]?.number ?? null
      return last && last.startsWith(String(year)) ? last : null
    },

    /**
     * Attribue le numéro et passe la facture à `sent`.
     *
     * **Le numéro n'est attribué qu'ici**, au passage `draft → sent`, jamais à la
     * création : une facture en brouillon peut être supprimée sans laisser de trou.
     *
     * La correction sous concurrence ne repose PAS sur ce code mais sur l'index
     * unique `invoices_number_unique (org_id, number)`. Deux émissions simultanées
     * calculent le même numéro ; la seconde échoue sur l'index, on relit et on
     * recommence. Un échec ne consomme aucun numéro, donc la série reste sans trou.
     *
     * Le jour de Postgres, cette boucle pourra devenir une séquence ou un
     * `SELECT ... FOR UPDATE` — mais la garantie restera portée par l'index.
     */
    async issue(id: string, year: number, issuedOn: string): Promise<InvoiceRow> {
      assertCanWrite(ctx)

      for (let attempt = 1; attempt <= MAX_NUMBERING_ATTEMPTS; attempt += 1) {
        const number = nextInvoiceNumber(year, await this.lastNumber(year))
        try {
          const updated = await base.update(id, { number, issuedOn, status: 'sent' })
          if (!updated) throw new Error('invoice not found')
          return updated
        } catch (error) {
          // Seul le conflit d'unicité justifie de réessayer. Tout le reste remonte.
          if (!isUniqueViolation(error)) throw error
        }
      }

      throw new InvoiceNumberingError(MAX_NUMBERING_ATTEMPTS)
    },
  }
}

export function usageCounterRepository(db: Db, ctx: TenantContext) {
  const base = forOrg<UsageCounterRow>(db, ctx, usageCounters)
  const scope = () => and(eq(usageCounters.orgId, ctx.orgId), isNull(usageCounters.deletedAt))!

  return {
    ...base,

    async all(): Promise<UsageCounterRow[]> {
      return withTenant(db, ctx, async (tx) =>
        tx.select().from(usageCounters).where(scope()),
      )
    },

    /**
     * Écrit la consommation observée.
     *
     * `onConflictDoUpdate` ÉCRASE ici, contrairement au kilométrage quotidien qui
     * accumule : un compteur d'usage est une PHOTO du réel, recalculée, pas un
     * cumul d'événements. S'il dérive, le recalcul le remet d'aplomb.
     */
    async record(counterKey: string, value: number, computedAt = nowIso()): Promise<void> {
      assertCanWrite(ctx)

      await withTenant(db, ctx, async (tx) => {
        await tx
          .insert(usageCounters)
          .values({ orgId: ctx.orgId, counterKey, value, computedAt })
          .onConflictDoUpdate({
            target: [usageCounters.orgId, usageCounters.counterKey],
            set: { value, computedAt, updatedAt: nowIso() },
          })
      })
    },
  }
}

/**
 * Événements de paiement — table de PLATEFORME, pas cloisonnée.
 *
 * Elle n'a pas d'`org_id` obligatoire : un webhook arrive avant qu'on sache à quelle
 * organisation il se rapporte, et il faut pouvoir le journaliser quand même.
 *
 * `(provider, event_id)` est UNIQUE : c'est cet index — et non le code applicatif —
 * qui rend l'ingestion idempotente. Les webhooks arrivent en double et dans le
 * désordre, c'est leur nature.
 */
export async function recordPaymentEvent(
  db: Db,
  event: {
    provider: string
    eventId: string
    type: string
    orgId?: string | null
    payload?: unknown
    receivedAt?: string
  },
): Promise<{ accepted: boolean }> {
  const inserted = await db
    .insert(paymentEvents)
    .values({
      provider: event.provider,
      eventId: event.eventId,
      type: event.type,
      orgId: event.orgId ?? null,
      payloadJson: event.payload === undefined ? null : JSON.stringify(event.payload),
      receivedAt: event.receivedAt ?? nowIso(),
    })
    .onConflictDoNothing()
    .returning({ id: paymentEvents.id })

  // `false` = déjà vu. Ce n'est pas une erreur : c'est le cas NORMAL d'un webhook
  // rejoué, et l'appelant doit répondre 200 pour que le prestataire cesse de réessayer.
  return { accepted: inserted.length > 0 }
}

export async function markPaymentEventProcessed(
  db: Db,
  provider: string,
  eventId: string,
  result: 'ok' | 'ignored' | 'error',
  error?: string,
): Promise<void> {
  await db
    .update(paymentEvents)
    .set({ processedAt: nowIso(), result, error: error ?? null })
    .where(and(eq(paymentEvents.provider, provider), eq(paymentEvents.eventId, eventId)))
}

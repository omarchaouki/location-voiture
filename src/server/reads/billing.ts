import { checkQuota, effectiveStatus, type CounterKey, type PlanLimits } from '~/core/billing'
import type { Db } from '~/db/client'
import { forOrg } from '~/db/repositories/base'
import { invoiceRepository, subscriptionRepository } from '~/db/repositories/billing'
import { vehicleRepository } from '~/db/repositories/vehicles'
import { branches } from '~/db/schema/platform'
import type { TenantContext } from '~/db/tenant'
import { businessCivilDate } from '~/i18n/format'
import { planLimits } from '../plan'

/**
 * LECTURES de l'abonnement — hors du module de server functions, comme les autres
 * (docs/DECISIONS.md §13.7).
 *
 * Ce que cet écran doit dire, et rien d'autre : quelle offre, jusqu'à quand, combien
 * de véhicules sur combien d'autorisés, et ce qui se passera si on ne paie pas. Le
 * front ne DÉCIDE rien : il affiche ce que le serveur a déjà tranché.
 */

export interface UsageLine {
  counter: CounterKey
  current: number
  /** `null` = illimité. */
  limit: number | null
  /** Reste-t-il de la place pour un de plus ? */
  room: boolean
}

export interface BillingOverview {
  planCode: string
  /** Statut EFFECTIF à aujourd'hui, pas celui qui traîne en base. */
  status: string
  periodEndsOn: string | null
  trialEndsOn: string | null
  graceUntilOn: string | null
  cancelAtPeriodEnd: boolean
  usage: UsageLine[]
  invoices: Array<{
    id: string
    number: string | null
    issuedOn: string | null
    totalCents: number
    currency: string
    status: string
    paidAt: string | null
  }>
}

/**
 * Compte ce qui est RÉELLEMENT là, sans lire les compteurs.
 *
 * Un quota se vérifie sur le réel, pas sur une photo qui peut avoir dérivé. Les
 * compteurs `usage_counters` servent à l'affichage et aux tableaux de bord ; c'est
 * cette fonction qui fait foi au moment d'autoriser une création.
 */
export async function countUsage(db: Db, ctx: TenantContext): Promise<Record<CounterKey, number>> {
  const vehicles = await vehicleRepository(db, ctx).count()
  const branchRows = await forOrg<typeof branches.$inferSelect>(db, ctx, branches).count()

  /*
   * Les utilisateurs ne sont pas une table cloisonnée : ce sont les MEMBRES de
   * l'organisation, dans une table d'authentification. Le décompte passe donc par le
   * lecteur dédié, jamais par `forOrg` — voir `countMembers`.
   */
  return { vehicles, branches: branchRows, users: await countMembers(db, ctx) }
}

/** Membres d'une organisation. Table Better Auth : lecture directe, pas de `forOrg`. */
async function countMembers(db: Db, ctx: TenantContext): Promise<number> {
  const { members } = await import('~/db/schema/auth')
  const { eq } = await import('drizzle-orm')
  const rows = await db
    .select({ id: members.id })
    .from(members)
    .where(eq(members.organizationId, ctx.orgId))
  return rows.length
}

export async function readBillingOverview(
  db: Db,
  ctx: TenantContext,
  today = businessCivilDate(new Date()),
): Promise<BillingOverview> {
  const subscription = await subscriptionRepository(db, ctx).current()
  const limits: PlanLimits = await planLimits(ctx.planCode, db)
  const usage = await countUsage(db, ctx)

  const status = effectiveStatus(
    {
      status: (subscription?.status ?? 'trialing') as never,
      trialEndsOn: civilOf(subscription?.trialEndsAt ?? null),
      periodEndsOn: civilOf(subscription?.periodEndAt ?? null),
      graceUntilOn: civilOf(subscription?.graceUntilAt ?? null),
      cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
    },
    today,
  )

  const rows = await invoiceRepository(db, ctx).list()

  return {
    planCode: ctx.planCode,
    status,
    periodEndsOn: civilOf(subscription?.periodEndAt ?? null),
    trialEndsOn: civilOf(subscription?.trialEndsAt ?? null),
    graceUntilOn: civilOf(subscription?.graceUntilAt ?? null),
    cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
    usage: (['vehicles', 'users', 'branches'] as const).map((counter) => {
      const verdict = checkQuota(counter, usage[counter], limits)
      return { counter, current: verdict.current, limit: verdict.limit, room: verdict.allowed }
    }),
    invoices: rows
      .sort((a, b) => (b.number ?? '').localeCompare(a.number ?? ''))
      .map((row) => ({
        id: row.id,
        number: row.number,
        issuedOn: row.issuedOn,
        totalCents: row.totalCents,
        currency: row.currency,
        status: row.status,
        paidAt: row.paidAt,
      })),
  }
}

/** Un instant ISO devient la date civile qu'il représente pour le métier. */
function civilOf(instant: string | null): string | null {
  return instant === null ? null : instant.slice(0, 10)
}

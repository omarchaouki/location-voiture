import { eq } from 'drizzle-orm'

import {
  DEFAULT_VAT_RATE_BP,
  effectiveStatus,
  invoiceTotals,
  type SubscriptionStatus,
} from '~/core/billing'
import { addCivilMonths } from '~/core/dates'
import type { Db } from '~/db/client'
import { invoiceRepository, subscriptionRepository } from '~/db/repositories/billing'
import { organizations } from '~/db/schema/auth'
import { businessCivilDate } from '~/i18n/format'
import { systemContext } from './system-context'

/**
 * Actes de PLATEFORME sur l'abonnement d'un client.
 *
 * Ils s'exécutent sous un contexte système : le propriétaire de plateforme n'est
 * membre d'aucune organisation cliente (docs/DECISIONS.md §11.5), il ne peut donc pas
 * s'appuyer sur une session d'organisation. Le contexte porte quand même l'`orgId`,
 * donc tout ce qui est écrit reste cloisonné.
 */

async function contextFor(db: Db, orgId: string) {
  const rows = await db
    .select({ planCode: organizations.planCode, status: organizations.status })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1)

  const org = rows[0]
  if (!org) return null
  return { ctx: systemContext(orgId, org.planCode), org }
}

export interface IssueInput {
  orgId: string
  subtotalCents: number
  vatRateBp?: number | undefined
  dueOn?: string | undefined
}

/**
 * Crée la facture en brouillon PUIS l'émet.
 *
 * Les deux temps comptent : un brouillon n'a pas de numéro et peut disparaître sans
 * laisser de trou dans la série. Le numéro n'est consommé qu'à l'émission.
 */
export async function issueSubscriptionInvoice(db: Db, input: IssueInput) {
  const found = await contextFor(db, input.orgId)
  if (!found) throw new Error(`organisation inconnue: ${input.orgId}`)

  const invoices = invoiceRepository(db, found.ctx)
  const today = businessCivilDate(new Date())
  const totals = invoiceTotals(input.subtotalCents, input.vatRateBp ?? DEFAULT_VAT_RATE_BP)

  const draft = await invoices.insert({
    subtotalCents: totals.subtotalCents,
    vatRateBp: input.vatRateBp ?? DEFAULT_VAT_RATE_BP,
    vatCents: totals.vatCents,
    totalCents: totals.totalCents,
    currency: 'MAD',
    status: 'draft',
    dueOn: input.dueOn ?? addCivilMonths(today, 1),
  })

  return invoices.issue(draft.id, Number(today.slice(0, 4)), today)
}

export interface SettleInput {
  orgId: string
  invoiceId: string
  method: string
  paidOn: string
  months: number
}

/**
 * Constate le règlement d'une facture et prolonge la période payée.
 *
 * La prolongation part du terme EXISTANT s'il est encore à venir, et de la date de
 * paiement sinon. Sans cette nuance, un client qui paie en avance perdrait les jours
 * qu'il lui restait, et un client en retard se verrait offrir la période impayée.
 */
export async function settleInvoice(db: Db, input: SettleInput) {
  const found = await contextFor(db, input.orgId)
  if (!found) return null

  const invoices = invoiceRepository(db, found.ctx)
  const invoice = await invoices.findById(input.invoiceId)
  if (!invoice) return null

  await invoices.update(invoice.id, {
    status: 'paid',
    paidAt: `${input.paidOn}T12:00:00.000Z`,
    provider: 'manual',
  })

  const subscriptions = subscriptionRepository(db, found.ctx)
  const current = await subscriptions.current()

  const currentEnd = current?.periodEndAt?.slice(0, 10) ?? null
  const start = currentEnd && currentEnd > input.paidOn ? currentEnd : input.paidOn
  const periodEndOn = addCivilMonths(start, input.months)

  if (current) {
    await subscriptions.update(current.id, {
      status: 'active',
      periodStartAt: `${start}T00:00:00.000Z`,
      periodEndAt: `${periodEndOn}T23:59:59.000Z`,
      graceUntilAt: null,
      provider: 'manual',
    })
  } else {
    await subscriptions.insert({
      planCode: found.org.planCode,
      status: 'active',
      provider: 'manual',
      interval: 'monthly',
      periodStartAt: `${start}T00:00:00.000Z`,
      periodEndAt: `${periodEndOn}T23:59:59.000Z`,
    })
  }

  const status = await applySubscriptionStatus(db, input.orgId)
  return { invoiceId: invoice.id, periodEndOn, status }
}

/**
 * Recalcule le statut d'une organisation et l'écrit sur `organizations.status`.
 *
 * C'est cette colonne que lit `requireTenant` pour décider du droit d'écrire
 * (`FROZEN_STATUSES`). Tant que personne ne l'écrivait, le cycle de vie de
 * l'abonnement n'avait aucun effet réel : une organisation impayée continuait de
 * travailler indéfiniment. C'est la fonction qui rend la règle vraie.
 */
export async function applySubscriptionStatus(
  db: Db,
  orgId: string,
  today = businessCivilDate(new Date()),
): Promise<SubscriptionStatus | null> {
  const found = await contextFor(db, orgId)
  if (!found) return null

  const current = await subscriptionRepository(db, found.ctx).current()

  const status = effectiveStatus(
    {
      status: (current?.status ?? 'trialing') as SubscriptionStatus,
      trialEndsOn: current?.trialEndsAt?.slice(0, 10) ?? null,
      periodEndsOn: current?.periodEndAt?.slice(0, 10) ?? null,
      graceUntilOn: current?.graceUntilAt?.slice(0, 10) ?? null,
      cancelAtPeriodEnd: current?.cancelAtPeriodEnd ?? false,
    },
    today,
  )

  /*
   * `suspended` est une décision HUMAINE de la plateforme (litige, fraude), pas une
   * conséquence du calendrier. Le cycle de vie ne doit jamais la lever tout seul.
   */
  if (found.org.status === 'suspended') return 'read_only'

  if (found.org.status !== status) {
    await db.update(organizations).set({ status }).where(eq(organizations.id, orgId))
  }

  return status
}

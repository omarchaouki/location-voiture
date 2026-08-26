import { createServerFn } from '@tanstack/react-start'
import { notFound } from '@tanstack/react-router'
import { z } from 'zod'

import { requireRole } from '~/auth/guards'
import { getDb } from '~/db/client'
import { audit } from './audit'
import { platformMiddleware, tenantMiddleware, writableTenantMiddleware } from './middleware'
import type { BillingOverview } from './reads/billing'

/**
 * ABONNEMENT — server functions.
 *
 * Deux publics, deux portes :
 *  - le CLIENT voit son offre, sa consommation et ses factures. Il ne peut rien
 *    changer : dans ce produit, on ne s'abonne pas en libre-service (docs/DECISIONS.md
 *    §3 — aucun prestataire de paiement n'opère au Maroc, tout passe par un règlement
 *    hors ligne constaté par la plateforme).
 *  - la PLATEFORME émet les factures et constate les règlements.
 *
 * **Ce qui n'est PAS ici, et volontairement** : l'intégration d'un prestataire de
 * paiement. La règle posée en Phase 0 tient (docs/DECISIONS.md §9, point 4) : aucune
 * ligne écrite contre une API de paiement avant d'avoir des identifiants de test et
 * la documentation officielle en main. Le chemin `manual` est complet et suffit à
 * facturer de vrais clients ; l'adaptateur viendra se brancher à côté.
 */

export const loadBilling = createServerFn({ method: 'GET' })
  .middleware([tenantMiddleware])
  .handler(async ({ context }): Promise<BillingOverview> => {
    const tenant = context.tenant
    // L'abonnement se regarde par le propriétaire et le gérant. Un agent de comptoir
    // n'a pas à connaître ce que l'agence paie (matrice docs/DOMAIN.md §3.1).
    requireRole(tenant, 'owner', 'manager')

    const { readBillingOverview } = await import('./reads/billing')
    return readBillingOverview(getDb(), tenant)
  })

/** Recalcule les compteurs d'affichage. Sans effet sur les autorisations. */
export const refreshUsage = createServerFn({ method: 'POST' })
  .middleware([writableTenantMiddleware])
  .handler(async ({ context }) => {
    const tenant = context.tenant
    requireRole(tenant, 'owner', 'manager')

    const { refreshUsageCounters } = await import('./quota')
    await refreshUsageCounters(getDb(), tenant)
    return { ok: true }
  })

/* ------------------------------------------------------------- plateforme */

const OrgIdInput = z.object({ orgId: z.string().min(1) })

const IssueInvoiceInput = z.object({
  orgId: z.string().min(1),
  /** Montant HORS TAXES, en centimes. La TVA est calculée, jamais saisie. */
  subtotalCents: z.int().min(0).max(100_000_000),
  vatRateBp: z.int().min(0).max(10_000).optional(),
  dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

/**
 * Émet une facture d'abonnement pour une organisation.
 *
 * Le numéro est attribué au passage `draft → sent`, dans le repository, et jamais
 * ici : c'est là que se joue l'invariant 9 (série continue, sans trou).
 */
export const issueInvoice = createServerFn({ method: 'POST' })
  .middleware([platformMiddleware])
  .validator(IssueInvoiceInput)
  .handler(async ({ data, context }) => {
    const db = getDb()
    const { issueSubscriptionInvoice } = await import('./billing-admin')
    const invoice = await issueSubscriptionInvoice(db, data)

    await audit({
      orgId: data.orgId,
      actorUserId: context.platform.userId,
      impersonated: false,
      action: 'invoice.issue',
      entityType: 'invoice',
      entityId: invoice.id,
      after: { number: invoice.number, totalCents: invoice.totalCents },
    })

    return { id: invoice.id, number: invoice.number, totalCents: invoice.totalCents }
  })

const RecordPaymentInput = z.object({
  orgId: z.string().min(1),
  invoiceId: z.string().min(1),
  /** cash | transfer | cheque — le règlement est constaté, pas encaissé par le produit. */
  method: z.enum(['cash', 'transfer', 'cheque']),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Mois d'abonnement couverts par ce règlement. */
  months: z.int().min(1).max(24).default(1),
})

/**
 * Constate un règlement et prolonge l'abonnement.
 *
 * « Constate » et non « encaisse » : aucun argent ne transite par le produit. C'est
 * la conséquence directe de l'absence de prestataire au Maroc, et c'est assumé — un
 * virement bancaire suivi d'une saisie vaut mieux qu'une intégration inventée.
 */
export const recordSubscriptionPayment = createServerFn({ method: 'POST' })
  .middleware([platformMiddleware])
  .validator(RecordPaymentInput)
  .handler(async ({ data, context }) => {
    const db = getDb()
    const { settleInvoice } = await import('./billing-admin')
    const result = await settleInvoice(db, data)
    if (!result) throw notFound()

    await audit({
      orgId: data.orgId,
      actorUserId: context.platform.userId,
      impersonated: false,
      action: 'invoice.paid',
      entityType: 'invoice',
      entityId: data.invoiceId,
      after: { method: data.method, paidOn: data.paidOn, months: data.months },
    })

    return result
  })

/** Applique le cycle de vie à une organisation. Idempotent. */
export const refreshSubscriptionStatus = createServerFn({ method: 'POST' })
  .middleware([platformMiddleware])
  .validator(OrgIdInput)
  .handler(async ({ data }) => {
    const { applySubscriptionStatus } = await import('./billing-admin')
    return applySubscriptionStatus(getDb(), data.orgId)
  })

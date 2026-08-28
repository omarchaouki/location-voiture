import { createServerFn } from '@tanstack/react-start'
import { getRequestIP } from '@tanstack/react-start/server'
import { notFound } from '@tanstack/react-router'
import { z } from 'zod'

import { requireRole } from '~/auth/guards'
import { getDb } from '~/db/client'
import { planChangeRepository } from '~/db/repositories/plan-changes'
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


/* ------------------------------------------- changement d'offre : la demande */

export const RequestPlanChangeInput = z.object({
  requestedPlanCode: z.string().trim().min(1).max(40),
  /** Le motif est OBLIGATOIRE : c'est ce que le commercial lit en premier. */
  reason: z.string().trim().min(3).max(500),
})

/**
 * DEMANDE DE CHANGEMENT D'OFFRE.
 *
 * Le client demande, la plateforme décide. Ce n'est pas une limitation technique :
 * l'offre porte un prix, des quotas et une facturation. La laisser changer d'un clic
 * ferait passer une agence de 5 à 40 voitures sans contrat commercial — et redescendre
 * le lendemain avec 38 voitures en base, donc au-dessus du quota, ce qui bloque tout.
 *
 * `owner` seulement : c'est un engagement financier, pas un réglage. Un gérant a tous
 * les droits sur le métier et aucun sur ce que l'agence paie.
 */
export const requestPlanChange = createServerFn({ method: 'POST' })
  .middleware([writableTenantMiddleware])
  .validator(RequestPlanChangeInput)
  .handler(async ({ data, context }) => {
    const tenant = context.tenant
    requireRole(tenant, 'owner')

    const db = getDb()
    const repository = planChangeRepository(db, tenant)

    // Une seule demande en attente à la fois. L'index unique le garantit aussi ; on le
    // vérifie ici pour rendre un message plutôt qu'une violation de contrainte.
    const existing = await repository.pending()
    if (existing) throw new Error('billing.requestAlreadyPending')
    if (data.requestedPlanCode === tenant.planCode) {
      throw new Error('billing.requestSamePlan')
    }

    const created = await repository.insert({
      currentPlanCode: tenant.planCode,
      requestedPlanCode: data.requestedPlanCode,
      reason: data.reason,
      status: 'pending',
      requestedBy: tenant.userId,
    })

    await audit({
      orgId: tenant.orgId,
      actorUserId: tenant.userId,
      impersonated: tenant.impersonated,
      action: 'plan.change.request',
      entityType: 'organization',
      entityId: tenant.orgId,
      after: { from: tenant.planCode, to: data.requestedPlanCode, reason: data.reason },
      request: { ip: getRequestIP() ?? null },
    })

    return { id: created.id }
  })

/** La demande en attente de l'agence, pour que l'écran ne la redemande pas. */
export const loadPlanChangeRequest = createServerFn({ method: 'GET' })
  .middleware([tenantMiddleware])
  .handler(async ({ context }) => {
    const pending = await planChangeRepository(getDb(), context.tenant).pending()
    if (!pending) return null
    return {
      id: pending.id,
      requestedPlanCode: pending.requestedPlanCode,
      reason: pending.reason,
      requestedAt: pending.createdAt,
    }
  })

/** Retirer sa demande. Toujours permis : on ne met pas d'obstacle sur un retrait. */
export const withdrawPlanChange = createServerFn({ method: 'POST' })
  .middleware([writableTenantMiddleware])
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data, context }) => {
    const tenant = context.tenant
    requireRole(tenant, 'owner')

    const updated = await planChangeRepository(getDb(), tenant).update(data.id, {
      status: 'withdrawn',
    })
    if (!updated) throw notFound()
    return { ok: true }
  })

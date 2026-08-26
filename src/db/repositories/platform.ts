import { and, count, desc, eq, gte, inArray, isNull, sum } from 'drizzle-orm'

import type { Db } from '~/db/client'
import { organizations } from '~/db/schema/auth'
import { invoices, plans } from '~/db/schema/billing'
import { contracts } from '~/db/schema/contracts'
import { leads } from '~/db/schema/platform'
import { vehicles } from '~/db/schema/vehicles'

/**
 * LECTURES DE PLATEFORME — le seul endroit du produit qui regarde TOUTES les
 * organisations à la fois.
 *
 * Ce fichier enfreint en apparence la règle qui prime sur tout : il lit des tables
 * cloisonnées sans `TenantContext`. C'est délibéré, et c'est pour cela qu'il est ici
 * plutôt que dans `src/server/` :
 *
 *  - il vit dans `src/db/repositories/`, le seul dossier où un accès direct aux
 *    tables est prévu — `pnpm check:hardcoded` refuserait le même code ailleurs ;
 *  - il ne renvoie que des AGRÉGATS et l'entête des organisations (nom, offre,
 *    état). Jamais une ligne métier : pas un contrat, pas un client, pas une plaque.
 *    Le propriétaire de plateforme qui veut voir les données d'une agence passe par
 *    l'impersonation, qui est tracée et limitée à trente minutes ;
 *  - chaque appelant passe d'abord par `requirePlatformOwner`.
 *
 * Si une fonction de ce fichier se met un jour à renvoyer des lignes plutôt que des
 * compteurs, c'est que le back-office est devenu une porte dérobée.
 */

export interface PlanBreakdown {
  planCode: string
  organizations: number
  /** Prix mensuel de l'offre, en centimes. */
  monthlyCents: number
}

export interface RevenueByCurrency {
  currency: string
  paidCents: number
  outstandingCents: number
}

export interface PlatformOrganizationRow {
  id: string
  name: string
  slug: string
  planCode: string
  status: string
  isDemo: boolean
  createdAt: string
  vehicles: number
}

export interface PlatformMetrics {
  organizations: {
    total: number
    active: number
    trialing: number
    atRisk: number
    demo: number
    createdLast30Days: number
  }
  fleet: { vehicles: number; rented: number }
  rentals: { active: number }
  /** Demandes de démonstration jamais rappelées. */
  newLeads: number
  /** Revenu récurrent mensuel théorique : la somme des offres réellement facturables. */
  mrrCents: number
  revenueLast30Days: RevenueByCurrency[]
  plans: PlanBreakdown[]
  recent: PlatformOrganizationRow[]
}

/** Offres qui rapportent : ni l'essai, ni les espaces de démonstration. */
const BILLABLE_STATUSES = ['active', 'past_due'] as const
/** États qui demandent une action de ma part. */
const AT_RISK_STATUSES = ['past_due', 'read_only', 'suspended', 'cancelled'] as const

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

export async function platformMetrics(db: Db, now: Date = new Date()): Promise<PlatformMetrics> {
  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const sinceCivil = since.toISOString().slice(0, 10)

  const aliveOrg = isNull(organizations.deletedAt)

  const [
    statusRows,
    createdRows,
    vehicleRows,
    rentalRows,
    invoiceRows,
    planRows,
    latest,
    leadRows,
  ] = await Promise.all([
      db
        .select({ status: organizations.status, isDemo: organizations.isDemo, n: count() })
        .from(organizations)
        .where(aliveOrg)
        .groupBy(organizations.status, organizations.isDemo),

      db
        .select({ n: count() })
        .from(organizations)
        .where(and(aliveOrg, gte(organizations.createdAt, since))),

      db
        .select({ status: vehicles.status, n: count() })
        .from(vehicles)
        .where(isNull(vehicles.deletedAt))
        .groupBy(vehicles.status),

      db
        .select({ n: count() })
        .from(contracts)
        .where(and(isNull(contracts.deletedAt), inArray(contracts.status, ['active', 'late']))),

      /*
       * Le chiffre d'affaires est groupé PAR DEVISE, jamais additionné à travers
       * elles. Toute ligne d'argent du produit porte sa devise (règle 4) ; sommer
       * des dirhams et des euros donnerait un nombre qui ne veut rien dire, et
       * personne ne s'en apercevrait tant qu'un seul client facture en euros.
       */
      db
        .select({
          currency: invoices.currency,
          status: invoices.status,
          total: sum(invoices.totalCents),
        })
        .from(invoices)
        .where(and(isNull(invoices.deletedAt), gte(invoices.issuedOn, sinceCivil)))
        .groupBy(invoices.currency, invoices.status),

      db
        .select({
          planCode: organizations.planCode,
          status: organizations.status,
          n: count(),
          monthlyCents: plans.monthlyCents,
        })
        .from(organizations)
        .leftJoin(plans, eq(plans.code, organizations.planCode))
        .where(and(aliveOrg, eq(organizations.isDemo, false)))
        .groupBy(organizations.planCode, organizations.status, plans.monthlyCents),

      db
        .select({
          id: organizations.id,
          name: organizations.name,
          slug: organizations.slug,
          planCode: organizations.planCode,
          status: organizations.status,
          isDemo: organizations.isDemo,
          createdAt: organizations.createdAt,
          vehicles: count(vehicles.id),
        })
        .from(organizations)
        .leftJoin(vehicles, and(eq(vehicles.orgId, organizations.id), isNull(vehicles.deletedAt)))
        .where(aliveOrg)
        .groupBy(organizations.id)
        .orderBy(desc(organizations.createdAt))
        .limit(6),

      db
        .select({ n: count() })
        .from(leads)
        .where(and(eq(leads.status, 'new'), isNull(leads.deletedAt))),
    ])

  const atRisk = new Set<string>(AT_RISK_STATUSES)
  const billable = new Set<string>(BILLABLE_STATUSES)

  const organizationTotals = statusRows.reduce(
    (acc, row) => {
      acc.total += row.n
      if (row.isDemo) acc.demo += row.n
      if (row.status === 'active') acc.active += row.n
      if (row.status === 'trialing') acc.trialing += row.n
      if (atRisk.has(row.status)) acc.atRisk += row.n
      return acc
    },
    { total: 0, active: 0, trialing: 0, atRisk: 0, demo: 0, createdLast30Days: 0 },
  )
  organizationTotals.createdLast30Days = createdRows[0]?.n ?? 0

  const fleet = vehicleRows.reduce(
    (acc, row) => {
      acc.vehicles += row.n
      if (row.status === 'rented') acc.rented += row.n
      return acc
    },
    { vehicles: 0, rented: 0 },
  )

  const revenueByCurrency = new Map<string, RevenueByCurrency>()
  for (const row of invoiceRows) {
    const entry = revenueByCurrency.get(row.currency) ?? {
      currency: row.currency,
      paidCents: 0,
      outstandingCents: 0,
    }
    // `void` et `draft` ne sont pas du chiffre d'affaires : ni encaissé, ni dû.
    if (row.status === 'paid') entry.paidCents += toNumber(row.total)
    else if (row.status === 'sent' || row.status === 'overdue') {
      entry.outstandingCents += toNumber(row.total)
    }
    revenueByCurrency.set(row.currency, entry)
  }

  const planTotals = new Map<string, PlanBreakdown>()
  let mrrCents = 0
  for (const row of planRows) {
    const entry = planTotals.get(row.planCode) ?? {
      planCode: row.planCode,
      organizations: 0,
      monthlyCents: row.monthlyCents ?? 0,
    }
    entry.organizations += row.n
    planTotals.set(row.planCode, entry)
    if (billable.has(row.status)) mrrCents += (row.monthlyCents ?? 0) * row.n
  }

  return {
    organizations: organizationTotals,
    fleet,
    rentals: { active: rentalRows[0]?.n ?? 0 },
    newLeads: leadRows[0]?.n ?? 0,
    mrrCents,
    revenueLast30Days: [...revenueByCurrency.values()].sort((a, b) =>
      a.currency.localeCompare(b.currency),
    ),
    plans: [...planTotals.values()].sort((a, b) => b.monthlyCents - a.monthlyCents),
    recent: latest.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
  }
}

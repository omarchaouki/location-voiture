import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { requireRole } from '~/auth/guards'
import { TemplateBlocks, type VariableValues } from '~/core/contract-template'
import { LOCALES } from '~/i18n/locales'
import { getDb } from '~/db/client'
import { audit } from './audit'
import { tenantMiddleware, writableTenantMiddleware } from './middleware'

/**
 * LE MODÈLE DE CONTRAT — chargement et enregistrement.
 *
 * **La fonctionnalité est liée à l'OFFRE** (`contract.template`), et l'autorisation se
 * décide côté serveur par `can()`, jamais par un `if (planCode === …)` (docs/DOMAIN.md
 * §3.2). L'écran, lui, reçoit un booléen et affiche une invitation à changer d'offre —
 * il ne décide de rien.
 *
 * **Le droit d'écrire est celui du propriétaire et du gérant.** Un agent de comptoir ne
 * réécrit pas les clauses du contrat qu'il fait signer : c'est un engagement de
 * l'agence, au même titre que sa raison sociale.
 */

export interface ContractTemplateView {
  id: string | null
  name: string
  locale: string
  blocks: z.infer<typeof TemplateBlocks>
  /** L'offre ouvre-t-elle la personnalisation ? Le refus, lui, est côté serveur. */
  unlocked: boolean
  canEdit: boolean
  planCode: string
}

export const loadContractTemplate = createServerFn({ method: 'GET' })
  .middleware([tenantMiddleware])
  .handler(async ({ context }): Promise<ContractTemplateView> => {
    const tenant = context.tenant
    const db = getDb()

    const { readContractTemplate } = await import('./reads/contract-template')
    const { can } = await import('./plan')

    const [stored, unlocked] = await Promise.all([
      readContractTemplate(db, tenant),
      can(tenant, 'contract.template', db),
    ])

    return {
      ...stored,
      unlocked,
      canEdit: (tenant.role === 'owner' || tenant.role === 'manager') && tenant.canWrite,
      planCode: tenant.planCode,
    }
  })

const SaveTemplateInput = z.object({
  name: z.string().trim().min(1).max(120),
  locale: z.enum(LOCALES),
  blocks: TemplateBlocks,
})

export const saveContractTemplate = createServerFn({ method: 'POST' })
  .middleware([writableTenantMiddleware])
  .validator(SaveTemplateInput)
  .handler(async ({ data, context }) => {
    const tenant = context.tenant
    requireRole(tenant, 'owner', 'manager')

    const db = getDb()

    // L'autorisation d'offre est vérifiée ICI, pas à l'affichage : un appel direct à la
    // server function contournerait un écran grisé.
    const { assertFeature } = await import('./plan')
    await assertFeature(tenant, 'contract.template', db)

    const { writeContractTemplate } = await import('./reads/contract-template')
    const saved = await writeContractTemplate(db, tenant, data)

    await audit({
      orgId: tenant.orgId,
      actorUserId: tenant.userId,
      impersonated: tenant.impersonated,
      action: 'contract.template',
      entityType: 'contract_template',
      entityId: saved.id,
      after: { name: data.name, locale: data.locale, blocks: data.blocks.length },
    })

    return { id: saved.id }
  })

export interface ContractTerms {
  blocks: z.infer<typeof TemplateBlocks>
  values: VariableValues
}

/**
 * LES CLAUSES D'UN CONTRAT DONNÉ, variables remplies.
 *
 * Chargée à part de `getContract` et non fondue dedans : la fiche contrat s'ouvre
 * cinquante fois par jour au comptoir pour vérifier une date, et ceci lit en plus le
 * modèle, l'agence, le client et le véhicule. Une lecture qu'on ne fait que pour
 * imprimer n'a pas à ralentir celle qu'on fait pour regarder.
 *
 * Rend `null` — et non une exception — quand l'offre n'ouvre pas la personnalisation
 * ou que le contrat n'existe pas : la fiche s'affiche alors sans bloc de clauses, ce
 * qui est le comportement d'avant cette fonctionnalité.
 */
export const loadContractTerms = createServerFn({ method: 'GET' })
  .middleware([tenantMiddleware])
  .validator(z.object({ contractId: z.string().min(1) }))
  .handler(async ({ data, context }): Promise<ContractTerms | null> => {
    const tenant = context.tenant
    const db = getDb()

    const { readContractTerms } = await import('./reads/contract-template')
    return readContractTerms(db, tenant, data.contractId)
  })

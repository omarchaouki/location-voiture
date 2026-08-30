import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { requireRole } from '~/auth/guards'
import { ORG_ROLES } from '~/auth/permissions'
import { getAuth } from '~/auth/server'
import { MIN_PASSWORD_LENGTH } from '~/core/schemas/signup'
import { getDb } from '~/db/client'
import { audit } from './audit'
import type { MemberRefusal, TeamMember } from './members-intake'
import { tenantMiddleware, writableTenantMiddleware } from './middleware'

/**
 * L'ÉQUIPE DE L'AGENCE — server functions seulement.
 *
 * Le travail vit dans `src/server/members-intake.ts` : il importe l'authentification
 * et la base, et une fonction exportée à côté d'un gestionnaire n'est pas retirée du
 * paquet client.
 *
 * **Le droit de créer un compte est celui du propriétaire et du gérant**, jamais celui
 * d'un agent de comptoir. C'est la même matrice que les réglages (docs/DOMAIN.md §3.1)
 * et pour une raison plus forte encore : créer un compte, c'est donner une clé.
 */

export interface TeamView {
  members: TeamMember[]
  /** Nombre de comptes autorisés par l'offre. `null` = illimité. */
  maxUsers: number | null
  planCode: string
  /** Le rôle décide de l'affichage ; le serveur, lui, refuse. */
  canManage: boolean
}

export const loadTeam = createServerFn({ method: 'GET' })
  .middleware([tenantMiddleware])
  .handler(async ({ context }): Promise<TeamView> => {
    const tenant = context.tenant
    const db = getDb()

    const { listTeam } = await import('./members-intake')
    const { planLimits } = await import('./plan')

    const [members, limits] = await Promise.all([
      listTeam(db, tenant),
      planLimits(tenant.planCode, db),
    ])

    return {
      members,
      maxUsers: limits.maxUsers,
      planCode: tenant.planCode,
      canManage: (tenant.role === 'owner' || tenant.role === 'manager') && tenant.canWrite,
    }
  })

const CreateMemberInput = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.email().max(180),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(200),
  role: z.enum(ORG_ROLES),
})

export type MemberResult = { ok: true } | { ok: false; reason: MemberRefusal }

export const createMember = createServerFn({ method: 'POST' })
  .middleware([writableTenantMiddleware])
  .validator(CreateMemberInput)
  .handler(async ({ data, context }): Promise<MemberResult> => {
    const tenant = context.tenant
    requireRole(tenant, 'owner', 'manager')

    const db = getDb()

    /*
     * LE QUOTA D'UTILISATEURS, vérifié avant l'écriture et côté serveur.
     *
     * C'est ce qui donne un sens commercial à la grille : trois comptes en Starter,
     * huit en Pro, quinze en Business. Le refus porte son motif pour que l'écran
     * propose de changer d'offre — un quota est une conversation commerciale, pas une
     * erreur technique (`src/server/quota.ts`).
     */
    const { assertQuota, QuotaExceededError } = await import('./quota')
    try {
      await assertQuota(db, tenant, 'users')
    } catch (error) {
      if (error instanceof QuotaExceededError) return { ok: false, reason: 'quota' }
      throw error
    }

    const { createTeamMember } = await import('./members-intake')
    const outcome = await createTeamMember(db, getAuth(), tenant, data)
    if (!outcome.ok) return outcome

    await audit({
      orgId: tenant.orgId,
      actorUserId: tenant.userId,
      impersonated: tenant.impersonated,
      action: 'member.create',
      entityType: 'user',
      entityId: outcome.userId,
      after: { email: data.email, role: data.role },
    })

    // Les compteurs affichés suivent l'écriture : sans ce rafraîchissement, la jauge
    // de l'abonnement montrerait l'ancien nombre jusqu'au prochain balayage.
    const { refreshUsageCounters } = await import('./quota')
    await refreshUsageCounters(db, tenant)

    return { ok: true }
  })

export const setMemberRole = createServerFn({ method: 'POST' })
  .middleware([writableTenantMiddleware])
  .validator(z.object({ memberId: z.string().min(1), role: z.enum(ORG_ROLES) }))
  .handler(async ({ data, context }): Promise<MemberResult> => {
    const tenant = context.tenant
    requireRole(tenant, 'owner', 'manager')

    const { changeMemberRole } = await import('./members-intake')
    const outcome = await changeMemberRole(getDb(), tenant, data.memberId, data.role)
    if (!outcome.ok) return outcome

    await audit({
      orgId: tenant.orgId,
      actorUserId: tenant.userId,
      impersonated: tenant.impersonated,
      action: 'member.role',
      entityType: 'member',
      entityId: data.memberId,
      after: { role: data.role },
    })

    return { ok: true }
  })

export const removeMember = createServerFn({ method: 'POST' })
  .middleware([writableTenantMiddleware])
  .validator(z.object({ memberId: z.string().min(1) }))
  .handler(async ({ data, context }): Promise<MemberResult> => {
    const tenant = context.tenant
    // Retirer un accès est réservé au PROPRIÉTAIRE : un gérant qui se fâche ne doit pas
    // pouvoir sortir son collègue de l'agence entre deux clients.
    requireRole(tenant, 'owner')

    const db = getDb()
    const { removeTeamMember } = await import('./members-intake')
    const outcome = await removeTeamMember(db, tenant, data.memberId)
    if (!outcome.ok) return outcome

    await audit({
      orgId: tenant.orgId,
      actorUserId: tenant.userId,
      impersonated: tenant.impersonated,
      action: 'member.remove',
      entityType: 'member',
      entityId: data.memberId,
    })

    const { refreshUsageCounters } = await import('./quota')
    await refreshUsageCounters(db, tenant)

    return { ok: true }
  })

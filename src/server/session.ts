import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { and, eq, isNull } from 'drizzle-orm'

import { describeActor, getSession, requireTenant } from '~/auth/context'
import { PLATFORM_OWNER, type OrgRole } from '~/auth/permissions'
import { getDb } from '~/db/client'
import { organizations } from '~/db/schema/auth'

/**
 * Ce que les écrans ont le droit de savoir sur la session en cours.
 *
 * Volontairement plat et pauvre : aucun objet Better Auth ne traverse la frontière,
 * aucun jeton, aucun mot de passe haché. Si l'authentification change en Phase 12,
 * cette forme ne bouge pas.
 */
export interface ViewerState {
  userId: string
  email: string
  name: string
  isPlatformOwner: boolean
  organization: {
    id: string
    name: string
    status: string
    isDemo: boolean
    role: OrgRole
    canWrite: boolean
  } | null
  impersonation: {
    /** Nom de l'administrateur qui consulte, pour le bandeau. */
    adminName: string
    canWrite: boolean
  } | null
}

/**
 * Lue par presque chaque route. Elle n'échoue jamais : elle renvoie `null` quand il
 * n'y a pas de session, et c'est à la route de décider de rediriger ou non.
 */
export const fetchViewer = createServerFn({ method: 'GET' }).handler(
  async (): Promise<ViewerState | null> => {
    const { headers } = getRequest()
    const session = await getSession(headers)
    if (!session) return null

    const base = {
      userId: session.userId,
      email: session.email,
      name: session.name,
      isPlatformOwner: session.platformRole === PLATFORM_OWNER && session.impersonatedBy === null,
    }

    if (!session.activeOrganizationId) {
      return { ...base, organization: null, impersonation: null }
    }

    // `requireTenant` refait les trois vérifications (appartenance, rôle, état).
    // Si elles échouent, l'écran se comporte comme s'il n'y avait pas d'organisation :
    // on ne montre jamais un espace auquel on n'a pas droit.
    let tenant
    try {
      tenant = await requireTenant(headers)
    } catch {
      return { ...base, organization: null, impersonation: null }
    }

    const db = getDb()
    const rows = await db
      .select({ name: organizations.name, status: organizations.status })
      .from(organizations)
      .where(and(eq(organizations.id, tenant.orgId), isNull(organizations.deletedAt)))
      .limit(1)

    const org = rows[0]
    if (!org) return { ...base, organization: null, impersonation: null }

    const impersonation =
      session.impersonatedBy !== null
        ? {
            adminName: (await describeActor(session.impersonatedBy))?.name ?? 'administrateur',
            canWrite: tenant.canWrite,
          }
        : null

    return {
      ...base,
      organization: {
        id: tenant.orgId,
        name: org.name,
        status: org.status,
        isDemo: tenant.isDemo,
        role: tenant.role,
        canWrite: tenant.canWrite,
      },
      impersonation,
    }
  },
)

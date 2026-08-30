import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { requireRole } from '~/auth/guards'
import { LOCALES } from '~/i18n/locales'
import { getDb } from '~/db/client'
import { audit } from './audit'
import { tenantMiddleware, writableTenantMiddleware } from './middleware'

/**
 * RÉGLAGES de l'organisation.
 *
 * Ce que l'écran modifie est l'identité de l'agence — celle qui apparaîtra sur les
 * contrats et les factures. C'est pour cela que le droit d'écrire est réservé au
 * propriétaire et au gérant (matrice `settings: ['read', 'update']`, docs/DOMAIN.md
 * §3.1) : un agent de comptoir ne renomme pas l'agence.
 *
 * Le thème et la langue ne sont PAS ici : ce sont des préférences d'appareil, gardées
 * côté navigateur. Les mélanger ferait croire qu'on impose sa langue à ses collègues.
 */

export interface OrganizationSettings {
  name: string
  city: string | null
  contactPhone: string | null
  contactEmail: string | null
  localeDefault: string
  timezone: string
  /** Clé de stockage du logo, jamais une URL. `null` = aucun logo posé. */
  logo: string | null
  planCode: string
  status: string
  /** Le rôle décide de l'affichage en lecture seule — le serveur, lui, refuse. */
  canEdit: boolean
}

export const loadSettings = createServerFn({ method: 'GET' })
  .middleware([tenantMiddleware])
  .handler(async ({ context }): Promise<OrganizationSettings> => {
    const { readOrganizationSettings } = await import('./reads/settings')
    return readOrganizationSettings(getDb(), context.tenant)
  })

const UpdateSettingsInput = z.object({
  name: z.string().trim().min(1).max(120),
  city: z.string().trim().max(80).nullable().default(null),
  contactPhone: z.string().trim().max(30).nullable().default(null),
  contactEmail: z.email().nullable().default(null),
  localeDefault: z.enum(LOCALES),
})

export const updateSettings = createServerFn({ method: 'POST' })
  .middleware([writableTenantMiddleware])
  .validator(UpdateSettingsInput)
  .handler(async ({ data, context }) => {
    const tenant = context.tenant
    // Le rôle est vérifié ICI, côté serveur. L'écran affiche en lecture seule pour un
    // agent, mais c'est cette ligne qui protège, pas l'affichage.
    requireRole(tenant, 'owner', 'manager')

    const { writeOrganizationSettings } = await import('./reads/settings')
    await writeOrganizationSettings(getDb(), tenant, data)

    await audit({
      orgId: tenant.orgId,
      actorUserId: tenant.userId,
      impersonated: tenant.impersonated,
      action: 'settings.update',
      entityType: 'organization',
      entityId: tenant.orgId,
      after: { name: data.name, city: data.city, localeDefault: data.localeDefault },
    })

    return { ok: true }
  })

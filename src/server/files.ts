import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { requireRole } from '~/auth/guards'
import { getDb } from '~/db/client'
import { audit } from './audit'
import { writableTenantMiddleware } from './middleware'

/**
 * TÉLÉVERSEMENT D'IMAGES — logo d'agence et vignette de véhicule.
 *
 * Ce fichier ne contient QUE des server functions : le travail vit dans
 * `src/server/file-intake.ts`, qui ouvre `node:fs` par la couche de stockage.
 *
 * La taille de la chaîne acceptée par le validateur est volontairement LARGE au regard
 * du mégaoctet autorisé après décodage : le base64 gonfle d'un tiers, et un refus qui
 * tombe au décodage porte un motif utilisable à l'écran, là où un refus de Zod ne dit
 * que « chaîne trop longue ».
 */

const MAX_DATA_URL_LENGTH = 1_500_000

const ImageInput = z.object({
  dataUrl: z.string().min(1).max(MAX_DATA_URL_LENGTH),
})

export type UploadResult = { ok: true; key: string } | { ok: false; reason: string }

/**
 * Le logo est une pièce d'IDENTITÉ de l'agence, au même titre que sa raison sociale :
 * il part sur les contrats imprimés. Le droit d'écrire est donc celui des réglages —
 * propriétaire et gérant —, pas celui du comptoir.
 */
export const uploadLogo = createServerFn({ method: 'POST' })
  .middleware([writableTenantMiddleware])
  .validator(ImageInput)
  .handler(async ({ data, context }): Promise<UploadResult> => {
    const tenant = context.tenant
    requireRole(tenant, 'owner', 'manager')

    const { storeOrganizationLogo, UploadRefused } = await import('./file-intake')
    try {
      const { key } = await storeOrganizationLogo(getDb(), tenant, data.dataUrl)

      await audit({
        orgId: tenant.orgId,
        actorUserId: tenant.userId,
        impersonated: tenant.impersonated,
        action: 'settings.logo',
        entityType: 'organization',
        entityId: tenant.orgId,
        after: { logo: key },
      })

      return { ok: true, key }
    } catch (error) {
      // Un refus de format n'est pas une panne : il se rend, avec son motif, pour que
      // l'écran dise « JPEG, PNG ou WebP » plutôt que « une erreur est survenue ».
      if (error instanceof UploadRefused) return { ok: false, reason: error.reason }
      throw error
    }
  })

export const removeLogo = createServerFn({ method: 'POST' })
  .middleware([writableTenantMiddleware])
  .handler(async ({ context }) => {
    const tenant = context.tenant
    requireRole(tenant, 'owner', 'manager')

    const { clearOrganizationLogo } = await import('./file-intake')
    await clearOrganizationLogo(getDb(), tenant)

    await audit({
      orgId: tenant.orgId,
      actorUserId: tenant.userId,
      impersonated: tenant.impersonated,
      action: 'settings.logo',
      entityType: 'organization',
      entityId: tenant.orgId,
      after: { logo: null },
    })

    return { ok: true }
  })

const VehicleImageInput = ImageInput.extend({ vehicleId: z.string().min(1) })

/**
 * La vignette d'une voiture, elle, se pose au comptoir.
 *
 * Aucun rôle particulier n'est exigé au-delà du droit d'écrire : celui qui saisit une
 * voiture est celui qui la photographie, et lui demander d'appeler le gérant pour
 * ajouter une image ferait qu'aucune voiture n'aurait d'image.
 */
export const uploadVehiclePhoto = createServerFn({ method: 'POST' })
  .middleware([writableTenantMiddleware])
  .validator(VehicleImageInput)
  .handler(async ({ data, context }): Promise<UploadResult> => {
    const tenant = context.tenant
    const { storeVehiclePhoto, UploadRefused } = await import('./file-intake')

    try {
      const stored = await storeVehiclePhoto(getDb(), tenant, data.vehicleId, data.dataUrl)
      // Véhicule d'une autre organisation : 404, jamais 403 — ne pas révéler l'existence.
      if (!stored) return { ok: false, reason: 'not_found' }

      await audit({
        orgId: tenant.orgId,
        actorUserId: tenant.userId,
        impersonated: tenant.impersonated,
        action: 'vehicle.photo',
        entityType: 'vehicle',
        entityId: data.vehicleId,
        after: { photoPath: stored.key },
      })

      return { ok: true, key: stored.key }
    } catch (error) {
      if (error instanceof UploadRefused) return { ok: false, reason: error.reason }
      throw error
    }
  })

export const removeVehiclePhoto = createServerFn({ method: 'POST' })
  .middleware([writableTenantMiddleware])
  .validator(z.object({ vehicleId: z.string().min(1) }))
  .handler(async ({ data, context }) => {
    const tenant = context.tenant
    const { clearVehiclePhoto } = await import('./file-intake')
    const done = await clearVehiclePhoto(getDb(), tenant, data.vehicleId)

    if (done) {
      await audit({
        orgId: tenant.orgId,
        actorUserId: tenant.userId,
        impersonated: tenant.impersonated,
        action: 'vehicle.photo',
        entityType: 'vehicle',
        entityId: data.vehicleId,
        after: { photoPath: null },
      })
    }

    return { ok: done }
  })

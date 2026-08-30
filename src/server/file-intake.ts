import { eq } from 'drizzle-orm'

import type { Db } from '~/db/client'
import { vehicleRepository } from '~/db/repositories/vehicles'
import { organizations } from '~/db/schema/auth'
import type { TenantContext } from '~/db/tenant'
import {
  getStorage,
  IMAGE_TYPES,
  MAX_UPLOAD_BYTES,
  storageKey,
  type StoredFile,
} from './storage'

/**
 * RÉCEPTION D'UNE IMAGE — décodage, contrôles, écriture, et l'ancienne effacée.
 *
 * Hors du module de server functions parce qu'il importe le stockage, donc
 * `node:fs/promises` : exporté à côté d'un gestionnaire, le module de fichiers de Node
 * partirait dans le paquet client (docs/DECISIONS.md §13.7).
 *
 * **L'image arrive en `data:` URL, pas en `multipart`.** Le navigateur la
 * redimensionne déjà avant l'envoi (`src/ui/forms/image-field.tsx`) — il faut donc de
 * toute façon la lire en mémoire côté client, et une chaîne traverse le validateur Zod
 * de la server function comme n'importe quel autre champ. Le surcoût du base64 est
 * d'un tiers sur une trentaine de kilo-octets ; un analyseur multipart maison, lui, se
 * paierait en failles.
 *
 * **Les contrôles sont ici et pas dans l'écran.** Le type déclaré dans l'en-tête
 * `data:` est confronté à la liste blanche, et la taille est mesurée APRÈS décodage :
 * une chaîne base64 annonçant 40 ko peut en peser 4 Mo une fois décodée.
 */

export type UploadRefusal = 'bad_format' | 'too_large' | 'unsupported_type'

export class UploadRefused extends Error {
  constructor(readonly reason: UploadRefusal) {
    super(`upload refused: ${reason}`)
    this.name = 'UploadRefused'
  }
}

/** `data:image/webp;base64,AAAA…` → octets et type. Lève sur tout le reste. */
export function decodeDataUrl(dataUrl: string): StoredFile {
  const match = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl.trim())
  if (!match) throw new UploadRefused('bad_format')

  const contentType = match[1]!.toLowerCase()
  if (!IMAGE_TYPES.includes(contentType)) throw new UploadRefused('unsupported_type')

  const bytes = Uint8Array.from(Buffer.from(match[2]!, 'base64'))
  // Mesurée sur les octets DÉCODÉS : c'est ce qui occupe le disque, et le seul nombre
  // qu'un appelant ne puisse pas mentir.
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new UploadRefused('too_large')
  }

  return { bytes, contentType }
}

/**
 * Efface l'ancienne image, une fois la nouvelle écrite et référencée.
 *
 * Dans cet ordre, et jamais l'inverse : effacer d'abord laisserait une fiche sans
 * image si l'écriture suivante échoue. L'échec de l'effacement, lui, est avalé — un
 * fichier orphelin coûte quelques kilo-octets, une exception ici ferait échouer un
 * remplacement qui a réussi.
 */
async function forget(previous: string | null): Promise<void> {
  if (!previous) return
  try {
    await getStorage().remove(previous)
  } catch {
    // Orphelin toléré : la fiche, elle, est juste.
  }
}

/** Le logo de l'agence — celui qui s'imprimera en tête des contrats. */
export async function storeOrganizationLogo(
  db: Db,
  ctx: TenantContext,
  dataUrl: string,
): Promise<{ key: string }> {
  const file = decodeDataUrl(dataUrl)
  const key = storageKey(ctx.orgId, 'logo', file.contentType)

  await getStorage().put(key, file)

  const previous = await db
    .select({ logo: organizations.logo })
    .from(organizations)
    .where(eq(organizations.id, ctx.orgId))
    .limit(1)

  await db.update(organizations).set({ logo: key }).where(eq(organizations.id, ctx.orgId))
  await forget(previous[0]?.logo ?? null)

  return { key }
}

/** Retire le logo. La colonne repasse à `null` : l'en-tête imprimé revient au nom. */
export async function clearOrganizationLogo(db: Db, ctx: TenantContext): Promise<void> {
  const previous = await db
    .select({ logo: organizations.logo })
    .from(organizations)
    .where(eq(organizations.id, ctx.orgId))
    .limit(1)

  await db.update(organizations).set({ logo: null }).where(eq(organizations.id, ctx.orgId))
  await forget(previous[0]?.logo ?? null)
}

/**
 * La vignette d'un véhicule.
 *
 * Le véhicule est relu par le repository AVANT l'écriture : un identifiant d'une autre
 * organisation rend `undefined`, donc 404 côté appelant. Sans cette lecture, une
 * requête forgée accrocherait une image à la voiture d'un concurrent.
 */
export async function storeVehiclePhoto(
  db: Db,
  ctx: TenantContext,
  vehicleId: string,
  dataUrl: string,
): Promise<{ key: string } | null> {
  const vehicles = vehicleRepository(db, ctx)
  const vehicle = await vehicles.findById(vehicleId)
  if (!vehicle) return null

  const file = decodeDataUrl(dataUrl)
  const key = storageKey(ctx.orgId, 'vehicle', file.contentType)

  await getStorage().put(key, file)
  await vehicles.update(vehicleId, { photoPath: key })
  await forget(vehicle.photoPath)

  return { key }
}

/** Retire la vignette d'un véhicule. La liste retombe sur l'icône dessinée à la main. */
export async function clearVehiclePhoto(
  db: Db,
  ctx: TenantContext,
  vehicleId: string,
): Promise<boolean> {
  const vehicles = vehicleRepository(db, ctx)
  const vehicle = await vehicles.findById(vehicleId)
  if (!vehicle) return false

  await vehicles.update(vehicleId, { photoPath: null })
  await forget(vehicle.photoPath)
  return true
}

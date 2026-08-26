import { z } from 'zod'

/**
 * Schémas partagés du GPS — un seul jeu pour le navigateur et le serveur.
 *
 * La géométrie d'une zone est stockée en JSON sérialisé (`geometry_json`, règle 5 de
 * la charte). Ces schémas sont donc la SEULE frontière où ce texte redevient une
 * forme : rien d'autre dans le code n'a le droit de faire confiance à son contenu.
 */

const vehicleId = z.string().min(1)

export const GPS_PROVIDERS = ['mock', 'traccar'] as const
export const GEOFENCE_KINDS = ['circle', 'polygon'] as const
export const GEOFENCE_SCOPES = ['all', 'vehicle', 'category'] as const

/** Latitude et longitude, bornées au domaine physique. */
export const LatLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
})

/**
 * Géométrie d'une zone.
 *
 * Le rayon minimal est de 50 m : au-dessous, l'incertitude d'un traceur automobile
 * (5 à 15 m, davantage en ville entre les immeubles) dépasse la moitié du rayon, et
 * la zone alerte au hasard. Le maximum de 200 km couvre « le territoire national »
 * sans permettre une zone qui ferait le tour de la Terre.
 */
export const CircleGeometry = z.object({
  kind: z.literal('circle'),
  center: LatLngSchema,
  radiusM: z.int().min(50).max(200_000),
})

/**
 * Anneau extérieur, NON refermé : le dernier point rejoint le premier
 * implicitement. Trois sommets au minimum — deux points ne délimitent rien.
 * Le plafond de 200 sommets protège la boucle de détection : elle est en O(sommets)
 * par position et par véhicule.
 */
export const PolygonGeometry = z.object({
  kind: z.literal('polygon'),
  ring: z.array(LatLngSchema).min(3).max(200),
})

export const GeofenceGeometry = z.discriminatedUnion('kind', [CircleGeometry, PolygonGeometry])
export type GeofenceGeometry = z.infer<typeof GeofenceGeometry>

export const CreateGeofenceInput = z.object({
  name: z.string().trim().min(1).max(80),
  geometry: GeofenceGeometry,
  appliesTo: z.enum(GEOFENCE_SCOPES).default('all'),
  appliesToValue: z.string().min(1).max(60).nullable().default(null),
})

export const UpdateGeofenceInput = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(80).optional(),
  geometry: GeofenceGeometry.optional(),
  appliesTo: z.enum(GEOFENCE_SCOPES).optional(),
  appliesToValue: z.string().min(1).max(60).nullable().optional(),
  isActive: z.boolean().optional(),
})

export const GeofenceIdInput = z.object({ id: z.string().min(1) })

/** Rattachement d'un boîtier à un véhicule. `vehicleId` nul = boîtier en stock. */
export const RegisterDeviceInput = z.object({
  vehicleId: vehicleId.nullable().default(null),
  provider: z.enum(GPS_PROVIDERS).default('mock'),
  externalId: z.string().trim().min(1).max(60),
  imei: z.string().trim().regex(/^\d{15}$/, { message: 'gps.imei.invalid' }).optional(),
  simNumber: z.string().trim().max(30).optional(),
  installedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'date.invalid' }).optional(),
})

export const AssignDeviceInput = z.object({
  id: z.string().min(1),
  vehicleId: vehicleId.nullable(),
})

/**
 * Fenêtre d'historique.
 *
 * Bornée à 31 jours : au-delà, la requête ramène des dizaines de milliers de points
 * qu'aucune carte ne sait afficher utilement. Un besoin d'analyse plus long est un
 * export, pas une carte.
 */
export const VehicleTrackInput = z.object({
  vehicleId,
  from: z.string().min(10),
  to: z.string().min(10),
})

export const MAX_TRACK_DAYS = 31

/** Lecture de la géométrie stockée. Une zone illisible est ignorée, jamais devinée. */
export function parseGeometry(json: string): GeofenceGeometry | undefined {
  try {
    const parsed = GeofenceGeometry.safeParse(JSON.parse(json))
    return parsed.success ? parsed.data : undefined
  } catch {
    return undefined
  }
}

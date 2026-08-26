import { GpsProviderError, type GpsProvider, type ProviderDevice, type ProviderPosition } from './provider'

/**
 * Adaptateur Traccar.
 *
 * Traccar est un serveur de suivi libre, auto-hébergeable : c'est ce qui le rend
 * utilisable au Maroc, là où les plateformes commerciales facturent par boîtier et
 * par mois en devises. Le produit ne parle jamais à un boîtier — il parle à Traccar,
 * qui parle aux boîtiers.
 *
 * Vérifié le 24/08/2026 contre `openapi.yaml` du dépôt officiel :
 *  - `GET /api/devices` renvoie `id`, `uniqueId`, `name`, `status`, `lastUpdate` ;
 *  - `GET /api/positions?deviceId=&from=&to=` — `from` et `to` en ISO 8601
 *    (« eg. `1963-11-22T18:30:00Z` »), et `deviceId` EXIGE les deux bornes ;
 *  - trois authentifications : basique, cookie de session, et jeton porteur.
 *    On retient le **jeton** : il ne porte pas de mot de passe et se révoque seul.
 *
 * ⚠️ **Non vérifié contre une instance réelle** : l'unité de `speed` et de `course`
 * n'est pas documentée dans le schéma OpenAPI. La convention historique de Traccar
 * est le NŒUD pour la vitesse et le degré pour le cap — c'est ce qu'applique
 * `knotsToKmh`. À confirmer au premier branchement sur un vrai serveur ; si la
 * convention diffère, il n'y a qu'une fonction à corriger, pas un adaptateur.
 */

export interface TraccarConfig {
  readonly url: string
  readonly token: string
}

/** Nœuds → km/h. LA conversion à vérifier ; elle n'est écrite qu'ici. */
export function knotsToKmh(knots: number): number {
  return Math.round(knots * 1.852 * 10) / 10
}

interface TraccarDevice {
  id: number
  uniqueId?: string
  name?: string
  status?: string
  lastUpdate?: string | null
}

interface TraccarPosition {
  deviceId: number
  fixTime?: string
  deviceTime?: string
  serverTime?: string
  latitude: number
  longitude: number
  speed?: number
  course?: number
  attributes?: Record<string, unknown>
}

export function createTraccarProvider(config: TraccarConfig): GpsProvider {
  const base = config.url.replace(/\/+$/, '')

  async function call<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${base}/api${path}`)
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)

    let response: Response
    try {
      response = await fetch(url, {
        headers: { Authorization: `Bearer ${config.token}`, Accept: 'application/json' },
      })
    } catch (error) {
      // Serveur injoignable : ce n'est pas la même panne qu'un refus, et l'écran
      // doit pouvoir le dire autrement.
      throw new GpsProviderError('traccar', null, `injoignable: ${String(error)}`)
    }

    if (!response.ok) {
      throw new GpsProviderError('traccar', response.status, await response.text())
    }
    return (await response.json()) as T
  }

  return {
    name: 'traccar',

    async listDevices(): Promise<ProviderDevice[]> {
      const devices = await call<TraccarDevice[]>('/devices')
      return devices.map((device) => ({
        /*
         * `uniqueId` (l'IMEI saisi à l'installation) et non `id` (la clé interne de
         * la base Traccar). Réinstaller Traccar renumérote les `id` ; l'IMEI, lui,
         * est gravé dans le boîtier. Rattacher un véhicule à un `id` reviendrait à
         * perdre la flotte entière à la première migration du serveur.
         */
        externalId: device.uniqueId ?? String(device.id),
        name: device.name ?? device.uniqueId ?? String(device.id),
        lastSeenAt: device.lastUpdate ?? null,
        status: device.status ?? 'unknown',
      }))
    },

    async fetchPositions({ externalDeviceId, from, to }): Promise<ProviderPosition[]> {
      // L'API interroge par `id` interne ; on part de l'IMEI, donc on résout d'abord.
      const devices = await call<TraccarDevice[]>('/devices', { uniqueId: externalDeviceId })
      const device = devices[0]
      if (!device) return []

      const positions = await call<TraccarPosition[]>('/positions', {
        deviceId: String(device.id),
        from,
        to,
      })

      return positions.map((position) => ({
        externalDeviceId,
        // `fixTime` est l'heure du POINT ; `serverTime` est l'heure d'arrivée du
        // paquet, qui peut suivre de plusieurs heures après une zone sans réseau.
        recordedAt: normalizeInstant(position.fixTime ?? position.deviceTime ?? position.serverTime),
        lat: position.latitude,
        lng: position.longitude,
        speedKmh: typeof position.speed === 'number' ? knotsToKmh(position.speed) : null,
        heading: typeof position.course === 'number' ? position.course : null,
        ignition: readBoolean(position.attributes?.['ignition']),
        odometerKm: readOdometerKm(position.attributes),
        raw: position,
      }))
    },
  }
}

/** Tout horodatage entrant devient de l'ISO 8601 UTC — la charte, règle 2. */
function normalizeInstant(value: string | undefined): string {
  const parsed = value ? Date.parse(value) : Number.NaN
  return new Date(Number.isFinite(parsed) ? parsed : Date.now()).toISOString()
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

/**
 * Compteur kilométrique.
 *
 * Traccar publie `totalDistance` en MÈTRES dans les attributs, et parfois un
 * `odometer` remonté par le boîtier lui-même. On prend le premier disponible et on
 * ramène en kilomètres entiers, parce que c'est ce qu'affiche un tableau de bord.
 */
function readOdometerKm(attributes: Record<string, unknown> | undefined): number | null {
  const total = attributes?.['totalDistance'] ?? attributes?.['odometer']
  return typeof total === 'number' && total > 0 ? Math.round(total / 1000) : null
}

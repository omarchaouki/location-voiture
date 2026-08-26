import { metersBetween } from '~/core/geo'
import type { GpsProvider, ProviderDevice, ProviderPosition } from './provider'

/**
 * Fournisseur SIMULÉ — celui qui sert à développer, à tester et à faire la démo.
 *
 * Il n'a pas d'état. Une position est une FONCTION de l'identifiant du boîtier et de
 * l'instant : la même fenêtre redemandée renvoie exactement les mêmes points, et
 * l'ingestion peut donc être rejouée cent fois sans rien créer de nouveau. Un
 * simulateur qui tirerait au hasard ne prouverait rien du tout — il masquerait
 * précisément les bugs d'idempotence qu'on cherche à écarter.
 *
 * Le trajet est une figure de Lissajous autour du centre de Casablanca : une boucle
 * fermée, sans discontinuité, parcourue à une vitesse plausible en ville. Les nuits
 * sont immobiles, parce qu'une flotte qui roule 24 h sur 24 rendrait l'alerte
 * d'usage hors contrat impossible à éprouver.
 */

/** Place des Nations Unies, Casablanca. Point de référence de toute la simulation. */
export const MOCK_CENTER = { lat: 33.5945, lng: -7.6167 } as const

/** Pas d'échantillonnage : un relevé toutes les deux minutes, comme un vrai boîtier. */
export const MOCK_STEP_MS = 120_000

/** Heures locales pendant lesquelles la flotte roule. En dehors, elle est garée. */
const ACTIVE_FROM_HOUR = 7
const ACTIVE_TO_HOUR = 21

/**
 * Empreinte stable d'une chaîne (FNV-1a 32 bits).
 *
 * `Math.random()` est proscrit ici : il faut que deux processus, deux jours
 * d'intervalle, produisent la même trace pour le même boîtier.
 */
function fingerprint(value: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash
}

/** Position d'un boîtier à un instant. Fonction pure, sans mémoire. */
export function mockPositionAt(externalDeviceId: string, at: Date): {
  lat: number
  lng: number
  moving: boolean
} {
  const seed = fingerprint(externalDeviceId)
  // Chaque boîtier reçoit sa propre boucle : rayon, phase et vitesse angulaire.
  const radiusLat = 0.012 + ((seed >>> 3) % 40) / 4000
  const radiusLng = 0.016 + ((seed >>> 11) % 40) / 3000
  const phase = ((seed >>> 17) % 628) / 100
  const period = 3_600_000 + ((seed >>> 23) % 40) * 60_000

  const hour = at.getUTCHours()
  const moving = hour >= ACTIVE_FROM_HOUR && hour < ACTIVE_TO_HOUR

  // La nuit, le temps s'arrête pour ce boîtier : la voiture reste où elle était à
  // l'heure de fermeture, au lieu de dériver dans un parking fermé.
  const frozen = moving
    ? at.getTime()
    : Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate(), ACTIVE_TO_HOUR, 0, 0)

  const angle = (2 * Math.PI * frozen) / period + phase

  return {
    lat: MOCK_CENTER.lat + radiusLat * Math.sin(angle),
    lng: MOCK_CENTER.lng + radiusLng * Math.sin(2 * angle + phase),
    moving,
  }
}

export function createMockProvider(deviceIds: ReadonlyArray<string> = []): GpsProvider {
  return {
    name: 'mock',

    // Pas d'`async` : ces deux méthodes ne franchissent aucune frontière. Le simulateur
    // est purement local — c'est précisément ce qui le rend rejouable.
    listDevices(): Promise<ProviderDevice[]> {
      return Promise.resolve(
        deviceIds.map((externalId) => ({
        externalId,
        name: externalId,
          lastSeenAt: new Date().toISOString(),
          status: 'online',
        })),
      )
    },

    fetchPositions({ externalDeviceId, from, to }): Promise<ProviderPosition[]> {
      const start = Date.parse(from)
      const end = Date.parse(to)
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        return Promise.resolve([])
      }

      /*
       * Les instants sont ALIGNÉS sur la grille d'échantillonnage, pas comptés depuis
       * `from`. Deux appels sur des fenêtres décalées de trente secondes renvoient
       * donc les mêmes horodatages — et l'index unique de `gps_positions` fait le
       * reste. Sans cet alignement, chaque relance créerait une trace parallèle.
       */
      const firstTick = Math.ceil(start / MOCK_STEP_MS) * MOCK_STEP_MS
      const positions: ProviderPosition[] = []
      let previous: { at: number; lat: number; lng: number } | null = null

      for (let tick = firstTick; tick <= end; tick += MOCK_STEP_MS) {
        const at = new Date(tick)
        const { lat, lng, moving } = mockPositionAt(externalDeviceId, at)

        const speedKmh = previous
          ? Math.round(
              (metersBetween({ lat: previous.lat, lng: previous.lng }, { lat, lng }) /
                ((tick - previous.at) / 1000)) *
                3.6,
            )
          : 0

        positions.push({
          externalDeviceId,
          recordedAt: at.toISOString(),
          lat,
          lng,
          speedKmh,
          heading: previous ? bearing(previous, { lat, lng }) : null,
          ignition: moving,
          odometerKm: null,
          raw: { simulated: true },
        })

        previous = { at: tick, lat, lng }
      }

      return Promise.resolve(positions)
    },
  }
}

/** Cap en degrés d'un point vers un autre, 0 = nord. */
function bearing(from: { lat: number; lng: number }, to: { lat: number; lng: number }): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180
  const deltaLng = toRadians(to.lng - from.lng)
  const fromLat = toRadians(from.lat)
  const toLat = toRadians(to.lat)

  const y = Math.sin(deltaLng) * Math.cos(toLat)
  const x =
    Math.cos(fromLat) * Math.sin(toLat) - Math.sin(fromLat) * Math.cos(toLat) * Math.cos(deltaLng)

  return Math.round((((Math.atan2(y, x) * 180) / Math.PI + 360) % 360) * 10) / 10
}

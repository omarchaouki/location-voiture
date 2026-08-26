/**
 * L'INTERFACE avec le monde extérieur du GPS.
 *
 * Tout ce que le produit sait faire du GPS passe par ces deux méthodes. Le reste du
 * code — ingestion, zones, alertes, carte — ne connaît AUCUN fournisseur : il ne
 * connaît que `GpsProvider`. C'est la même discipline que pour le paiement
 * (docs/DECISIONS.md §3) et pour la même raison : le prestataire change, le métier
 * non.
 *
 * Deux implémentations en Phase 7 :
 *  - `mock`, déterministe, qui permet de développer et de tester sans matériel ;
 *  - `traccar`, contre une instance auto-hébergée.
 */

export interface ProviderDevice {
  /** Identifiant CHEZ LE FOURNISSEUR. C'est la clé de rapprochement. */
  readonly externalId: string
  readonly name: string
  readonly lastSeenAt: string | null
  /** online | offline | unknown */
  readonly status: string
}

export interface ProviderPosition {
  readonly externalDeviceId: string
  /** Instant ISO 8601 UTC. Toujours l'heure du FIX, jamais celle du serveur. */
  readonly recordedAt: string
  readonly lat: number
  readonly lng: number
  readonly speedKmh: number | null
  /** Cap en degrés, 0 = nord. */
  readonly heading: number | null
  readonly ignition: boolean | null
  readonly odometerKm: number | null
  /** Charge utile d'origine, conservée telle quelle pour pouvoir rejouer. */
  readonly raw: unknown
}

export interface GpsProvider {
  readonly name: 'mock' | 'traccar'
  listDevices(): Promise<ProviderDevice[]>
  /**
   * Positions d'un boîtier sur une fenêtre fermée.
   *
   * Le contrat qui compte : **la même fenêtre doit toujours renvoyer les mêmes
   * positions**. C'est ce qui rend l'ingestion rejouable — et ce que le fournisseur
   * simulé respecte scrupuleusement, sans quoi il ne prouverait rien.
   */
  fetchPositions(query: {
    externalDeviceId: string
    from: string
    to: string
  }): Promise<ProviderPosition[]>
}

/** Levée quand le fournisseur est joignable mais refuse — jamais affichée telle quelle. */
export class GpsProviderError extends Error {
  constructor(
    readonly provider: string,
    readonly status: number | null,
    message: string,
  ) {
    super(message)
    this.name = 'GpsProviderError'
  }
}

import { civilDaysBetween, type CivilDate } from '../dates'

/**
 * Franchissement de seuils.
 *
 * Règle de conception : le moteur n'émet QUE le seuil courant, pas tous ceux déjà
 * franchis. Sinon, à J-7, une police d'assurance produirait trois alertes ouvertes
 * (J-30, J-14, J-7) pour une seule chose à faire, et le centre de notifications
 * deviendrait un tas.
 *
 * L'historique n'est pas perdu pour autant : chaque seuil franchi laisse sa ligne en
 * base (identité distincte), et `syncAlerts` clôt les précédentes quand une plus
 * grave apparaît. On garde la trace, on ne garde pas le bruit.
 */

export interface ExpiryThresholds {
  /** Jours avant l'échéance auxquels on prévient, du plus lointain au plus proche. */
  readonly before: ReadonlyArray<number>
  /** Émet-on une alerte quotidienne une fois l'échéance dépassée ? */
  readonly daily: boolean
}

/**
 * Seuil courant pour une date d'expiration.
 *
 * Renvoie `null` si l'échéance est encore trop lointaine pour prévenir — le silence
 * est une réponse valable, et c'est même la réponse la plus fréquente.
 */
export function expiryThreshold(
  today: CivilDate,
  expiresOn: CivilDate,
  thresholds: ExpiryThresholds,
): { key: string; days: number } | null {
  const days = civilDaysBetween(today, expiresOn)

  if (days < 0) {
    return thresholds.daily ? { key: 'overdue', days } : { key: 'overdue', days }
  }
  if (days === 0) return { key: 'd-0', days }

  // Le plus PETIT seuil déjà atteint : à J-10 avec [30, 14, 7], c'est 14.
  const crossed = thresholds.before.filter((threshold) => days <= threshold)
  const current = crossed.length > 0 ? Math.min(...crossed) : null

  return current === null ? null : { key: `d-${current}`, days }
}

/**
 * Sévérité effective : une échéance dépassée est toujours plus grave que la même
 * échéance à venir. Un gérant ne doit pas avoir à lire la date pour comprendre.
 */
export function escalate<T extends string>(base: T, days: number, overdue: T): T {
  return days < 0 ? overdue : base
}

/** Heures écoulées depuis un instant. Sert aux règles de retard de contrat. */
export function hoursSince(now: string, instant: string): number {
  return Math.floor((Date.parse(now) - Date.parse(instant)) / 3_600_000)
}

/**
 * Palier de retard, par tranches de 3 heures (cahier des charges §10).
 *
 * Plafonné à 72 h : au-delà, la relance toutes les trois heures n'apporte plus rien,
 * l'alerte est déjà critique et permanente. Sans ce plafond, un contrat oublié
 * pendant un mois produirait 240 lignes.
 */
export function latenessThreshold(hours: number): string | null {
  if (hours < 0) return null
  if (hours >= 72) return 'late-72h'
  const step = Math.floor(hours / 3) * 3
  return `late-${step}h`
}

/**
 * Positionnement de la frise du carnet — la signature du produit.
 *
 * L'espacement est PROPORTIONNEL AU TEMPS, compressé logarithmiquement : deux
 * échéances la même semaine se voient comme un paquet serré, une échéance dans huit
 * mois est loin. C'est cette compression qui crée la sensation d'urgence, pas la
 * couleur (docs/DESIGN.md §5).
 *
 * Sans compression, une échéance à 205 jours écraserait tout le reste ; sans
 * relâchement, deux échéances le même jour se superposeraient. Les deux passes sont
 * donc nécessaires, et la ligne « aujourd'hui » reste exactement à sa place parce
 * qu'on relâche le passé et le futur séparément, chacun en s'éloignant d'elle.
 *
 * Module pur : ni React, ni CSS. Testable.
 */

export interface RailInput {
  id: string
  /** Jours civils depuis aujourd'hui. Négatif = passé, 0 = aujourd'hui. */
  days: number
}

export interface RailPlacement {
  id: string
  days: number
  /** Position verticale en pixels, depuis le haut du conteneur. */
  y: number
}

export interface RailLayout {
  placements: ReadonlyArray<RailPlacement>
  /** Position de la ligne « aujourd'hui », en pixels depuis le haut. */
  todayY: number
  /** Hauteur totale nécessaire, en pixels. */
  height: number
}

export interface RailOptions {
  /** Pixels par unité de log. 46 donne ~46 px entre J+0 et J+1,7. */
  scale?: number
  /** Écart minimum entre deux entrées voisines, en pixels. */
  minGap?: number
  /** Marge au-dessus de la première entrée et sous la dernière. */
  padding?: number
}

const DEFAULTS = { scale: 46, minGap: 44, padding: 28 } as const

/** Compression logarithmique, symétrique autour d'aujourd'hui. */
function rawOffset(days: number, scale: number): number {
  return Math.sign(days) * Math.log1p(Math.abs(days)) * scale
}

export function layoutRail(
  inputs: ReadonlyArray<RailInput>,
  options: RailOptions = {},
): RailLayout {
  const scale = options.scale ?? DEFAULTS.scale
  const minGap = options.minGap ?? DEFAULTS.minGap
  const padding = options.padding ?? DEFAULTS.padding

  if (inputs.length === 0) {
    return { placements: [], todayY: padding, height: padding * 2 }
  }

  const future = inputs
    .filter((item) => item.days >= 0)
    .slice()
    .sort((a, b) => a.days - b.days)

  const past = inputs
    .filter((item) => item.days < 0)
    .slice()
    .sort((a, b) => b.days - a.days) // du plus récent au plus ancien

  const offsets = new Map<string, number>()

  // Futur : on descend depuis la ligne « aujourd'hui », en s'en éloignant.
  let previous = 0
  for (const item of future) {
    const y = Math.max(rawOffset(item.days, scale), previous + minGap)
    offsets.set(item.id, y)
    previous = y
  }

  // Passé : on remonte depuis la ligne « aujourd'hui », symétriquement.
  previous = 0
  for (const item of past) {
    const y = Math.min(rawOffset(item.days, scale), previous - minGap)
    offsets.set(item.id, y)
    previous = y
  }

  const values = [...offsets.values()]
  const minOffset = values.length > 0 ? Math.min(0, ...values) : 0
  const maxOffset = values.length > 0 ? Math.max(0, ...values) : 0
  const shift = padding - minOffset

  const placements: RailPlacement[] = inputs.map((item) => ({
    id: item.id,
    days: item.days,
    y: (offsets.get(item.id) ?? 0) + shift,
  }))

  return {
    placements,
    todayY: shift,
    height: maxOffset - minOffset + padding * 2,
  }
}

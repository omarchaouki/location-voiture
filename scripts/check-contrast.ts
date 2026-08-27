/**
 * Mesure les contrastes réels des paires de jetons, dans les deux thèmes.
 *
 * On ne DÉCLARE pas que le produit est AA : on le mesure, et on colle la sortie
 * dans docs/AUDIT.md. Le script lit `src/styles/tokens.css`, il n'a donc aucune
 * valeur codée en dur susceptible de diverger du CSS réel.
 *
 *   pnpm check:tokens
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const TOKENS_PATH = fileURLToPath(new URL('../src/styles/tokens.css', import.meta.url))

/* ---------------------------------------------------------------- couleurs */

/** OKLCH → sRGB linéaire, puis sRGB. Conversion standard (Björn Ottosson). */
function oklchToRgb(lightness: number, chroma: number, hueDeg: number): [number, number, number] {
  const hue = (hueDeg * Math.PI) / 180
  const a = chroma * Math.cos(hue)
  const b = chroma * Math.sin(hue)

  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3

  const linear: [number, number, number] = [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]

  return linear.map(toSrgb) as [number, number, number]
}

function toSrgb(channel: number): number {
  const clamped = Math.max(0, Math.min(1, channel))
  return clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055
}

/** Luminance relative WCAG 2.x. */
function luminance([r, g, b]: [number, number, number]): number {
  const channel = (value: number) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (light + 0.05) / (dark + 0.05)
}

/* ------------------------------------------------------------------ lecture */

type Palette = Record<string, [number, number, number]>

const OKLCH = /--([a-z-]+):\s*oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/g

/** Extrait les jetons d'un bloc CSS donné (le premier `{ … }` après le sélecteur). */
function readBlock(css: string, selector: string): Palette {
  const start = css.indexOf(selector)
  if (start === -1) throw new Error(`Bloc introuvable : ${selector}`)
  const open = css.indexOf('{', start)
  const close = css.indexOf('}', open)
  const body = css.slice(open, close)

  const palette: Palette = {}
  for (const match of body.matchAll(OKLCH)) {
    const [, name, l, c, h] = match
    if (!name || !l || !c || !h) continue
    palette[name] = oklchToRgb(Number(l), Number(c), Number(h))
  }
  return palette
}

/* -------------------------------------------------------------------- paires */

interface Pair {
  foreground: string
  background: string
  label: string
  /** 4.5 pour du texte courant, 3 pour les composants d'interface (WCAG 1.4.11). */
  minimum: number
  /**
   * Séparateur purement décoratif : explicitement hors du périmètre de WCAG 1.4.11,
   * qui ne vise que les éléments nécessaires à la COMPRÉHENSION du contenu. On le
   * mesure quand même et on l'affiche, mais il ne fait pas échouer la commande —
   * abaisser le seuil pour qu'il passe aurait été de la triche.
   */
  decorative?: boolean
}

/**
 * Les paires, réécrites le 27/08/2026 avec les jetons shadcn.
 *
 * Elles portent les mêmes questions qu'avant, posées aux nouveaux noms : le texte
 * courant est-il lisible sur chaque surface, la sévérité se distingue-t-elle du fond,
 * et le pourtour d'un contrôle atteint-il les 3:1 de WCAG 1.4.11.
 */
const PAIRS: ReadonlyArray<Pair> = [
  { foreground: 'foreground', background: 'background', label: 'Texte principal sur le fond', minimum: 4.5 },
  { foreground: 'card-foreground', background: 'card', label: 'Texte principal sur carte', minimum: 4.5 },
  { foreground: 'popover-foreground', background: 'popover', label: 'Texte sur couche flottante', minimum: 4.5 },
  { foreground: 'muted-foreground', background: 'background', label: 'Libellés sur le fond', minimum: 4.5 },
  { foreground: 'muted-foreground', background: 'card', label: 'Libellés sur carte', minimum: 4.5 },
  { foreground: 'muted-foreground', background: 'muted', label: 'Libellés sur surface sourde', minimum: 4.5 },
  { foreground: 'primary-foreground', background: 'primary', label: 'Texte sur bouton principal', minimum: 4.5 },
  { foreground: 'secondary-foreground', background: 'secondary', label: 'Texte sur bouton secondaire', minimum: 4.5 },
  { foreground: 'accent-foreground', background: 'accent', label: 'Texte sur accent', minimum: 4.5 },
  { foreground: 'destructive', background: 'background', label: 'Sévérité dépassée', minimum: 4.5 },
  { foreground: 'destructive', background: 'card', label: 'Sévérité dépassée sur carte', minimum: 4.5 },
  { foreground: 'warning', background: 'background', label: 'Sévérité approchante', minimum: 4.5 },
  { foreground: 'success', background: 'background', label: 'Sévérité à jour', minimum: 4.5 },
  {
    foreground: 'border',
    background: 'background',
    label: 'Filet de séparation (décoratif)',
    minimum: 3,
    decorative: true,
  },
  {
    foreground: 'input',
    background: 'background',
    label: 'Bordure de contrôle (bouton, champ)',
    minimum: 3,
  },
  {
    foreground: 'ring',
    background: 'background',
    label: 'Anneau de focus',
    minimum: 3,
  },
]

/* --------------------------------------------------------------------- main */

const css = readFileSync(TOKENS_PATH, 'utf8')
const light = readBlock(css, ':root {')
const dark = readBlock(css, ":root[data-theme='dark']")

let failures = 0

for (const [themeName, palette] of [
  ['clair', light],
  ['sombre', dark],
] as const) {
  console.log(`\nThème ${themeName}`)
  console.log('─'.repeat(78))

  for (const pair of PAIRS) {
    const foreground = palette[pair.foreground]
    const background = palette[pair.background]
    if (!foreground || !background) {
      console.log(`  ?  ${pair.label.padEnd(38)} jeton manquant`)
      failures += 1
      continue
    }

    const ratio = contrastRatio(foreground, background)
    const ok = ratio >= pair.minimum
    if (!ok && !pair.decorative) failures += 1
    const mark = pair.decorative ? 'INFO ' : ok ? 'OK   ' : 'ÉCHEC'
    const note = pair.decorative ? '  (décoratif, hors 1.4.11)' : `  (min ${pair.minimum})`
    console.log(`  ${mark} ${pair.label.padEnd(38)} ${ratio.toFixed(2)}:1${note}`)
  }
}

console.log(
  `\n${failures === 0 ? 'Toutes les paires atteignent leur seuil.' : `${failures} paire(s) sous le seuil.`}`,
)

process.exit(failures === 0 ? 0 : 1)

import type { ReactNode } from 'react'

/**
 * CARTES, TUILES ET EN-TÊTES — les briques des écrans de gestion.
 *
 * Direction : console d'administration (docs/DESIGN.md §11). Trois choses ont changé
 * après relecture, et toutes les trois répondent au même reproche — « ça ressemble à
 * une maquette générée » :
 *
 *  1. **Les libellés de tuile ne sont plus en capitales espacées.** Le petit label
 *     `UPPERCASE tracking-wide` au-dessus d'un grand chiffre est la signature la plus
 *     reconnaissable des tableaux de bord produits à la chaîne. Une console écrit le
 *     libellé en minuscules, dans la même voix que le reste.
 *  2. **Les tuiles ne flottent plus séparément.** Elles vivent dans UNE carte,
 *     séparées par des filets. Quatre cartes détachées portant chacune un nombre
 *     donnent une page de vignettes ; un groupe donne une barre de mesures, qui est
 *     ce qu'on lit d'un coup d'œil.
 *  3. **Le titre de carte est un titre, pas une bannière** : 13 px, graisse moyenne,
 *     posé sur un filet. Pas de fond coloré, pas d'icône décorative.
 */

export function Card({
  children,
  className,
  as: As = 'section',
}: {
  children: ReactNode
  className?: string
  as?: 'section' | 'div' | 'article'
}) {
  return (
    <As
      className={`overflow-hidden rounded-lg border border-border bg-card shadow-card ${className ?? ''}`.trim()}
    >
      {children}
    </As>
  )
}

/** En-tête de carte : un titre, et au plus une action en fin de ligne. */
export function CardHeader({
  title,
  hint,
  action,
}: {
  title: ReactNode
  hint?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      {action ? <span className="ms-auto">{action}</span> : null}
    </div>
  )
}

/** Corps de carte. `flush` sert aux tableaux, qui posent leur propre gouttière. */
export function CardBody({
  children,
  flush = false,
  className,
}: {
  children: ReactNode
  flush?: boolean
  className?: string
}) {
  return (
    <div className={`${flush ? '' : 'px-4 py-4'} ${className ?? ''}`.trim()}>{children}</div>
  )
}

export type TileTone = 'neutral' | 'accent' | 'calm' | 'warn' | 'danger'

const TILE_VALUE_TONE: Record<TileTone, string> = {
  neutral: 'text-foreground',
  accent: 'text-primary',
  calm: 'text-success',
  warn: 'text-warning',
  danger: 'text-destructive',
}

export interface Tile {
  key: string
  label: ReactNode
  value: ReactNode
  hint?: ReactNode
  tone?: TileTone
}

/**
 * Groupe de mesures — UNE carte, des colonnes séparées par des filets.
 *
 * Les tuiles sont passées en TABLEAU plutôt qu'en enfants, et ce n'est pas un détail
 * d'API : les séparateurs dépendent de la position dans la grille, et la position
 * change avec le point de rupture (2 colonnes sur téléphone, 4 sur écran large). Une
 * tuile ne peut pas connaître son propre rang ; le groupe, si. La règle vit donc ici,
 * une fois, au lieu d'être approchée par des variantes CSS qui se trompent d'un cran
 * à chaque changement de largeur.
 *
 * Le résultat est une barre de mesures continue, pas une rangée de vignettes
 * détachées — c'est la différence de lecture entre une console et une page d'accueil.
 */
export function StatGroup({ items }: { items: readonly Tile[] }) {
  return (
    <Card as="div">
      <div className="grid grid-cols-2 lg:grid-cols-4">
        {items.map((item, index) => (
          <div
            key={item.key}
            className={[
              'px-4 py-3',
              // Filet vertical : partout sauf en début de rangée.
              index % 2 !== 0 ? 'border-s border-border' : '',
              'lg:border-s lg:border-border',
              index % 4 === 0 ? 'lg:border-s-0' : '',
              // Filet horizontal : partout sauf sur la première rangée.
              index >= 2 ? 'border-t border-border' : '',
              index >= 4 ? 'lg:border-t' : 'lg:border-t-0',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <p className="text-xs text-muted-foreground">{item.label}</p>
            {/*
              Le chiffre porte `.numeric` : les mesures d'une même rangée s'alignent au
              chiffre près, et le total ne saute pas quand il passe de 9 à 10.
            */}
            <p
              className={`numeric mt-1 text-xl font-semibold ${TILE_VALUE_TONE[item.tone ?? 'neutral']}`}
            >
              {item.value}
            </p>
            {item.hint ? <p className="mt-0.5 text-xs text-muted-foreground">{item.hint}</p> : null}
          </div>
        ))}
      </div>
    </Card>
  )
}

/**
 * En-tête de page. Une seule par écran, et elle porte l'action principale.
 *
 * Le titre est en 20 px, pas en 32 : une console n'a pas de titre d'affiche. C'est le
 * fil d'Ariane et la position dans la barre latérale qui disent où l'on est ; le
 * titre le confirme, il ne l'annonce pas.
 */
export function PageHeader({
  title,
  description,
  action,
  meta,
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  meta?: ReactNode
}) {
  return (
    <header className="mb-5 flex flex-wrap items-start gap-x-4 gap-y-3">
      <div className="min-w-0 flex-1">
        <h1 className="text-lg font-semibold">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
        {meta ? <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </header>
  )
}

/**
 * Titre de section entre deux cartes. Sert à grouper sans imbriquer une carte dans
 * une carte — l'empilement de cadres est l'autre défaut classique de ces écrans.
 */
export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 text-sm font-semibold">{children}</h2>
}

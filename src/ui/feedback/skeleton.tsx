import type { CSSProperties } from 'react'

/**
 * Bloc de squelette.
 *
 * Règle (docs/DESIGN.md §7) : un squelette reproduit la GÉOMÉTRIE EXACTE du contenu
 * réel — mêmes hauteurs de ligne, mêmes colonnes, mêmes filets — pour qu'aucun
 * décalage ne se produise à l'arrivée des données.
 *
 * Un squelette ne s'affiche JAMAIS pour un rafraîchissement en arrière-plan :
 * dans ce cas le contenu reste, seule la barre supérieure bouge.
 */
export function Skeleton({
  width,
  height = '1em',
  className,
}: {
  width?: string | number
  height?: string | number
  className?: string
}) {
  const style: CSSProperties = { width, height }
  return (
    <span
      aria-hidden="true"
      className={`skeleton block rounded-sm ${className ?? ''}`}
      style={style}
    />
  )
}

/**
 * Enveloppe accessible : elle annonce le chargement une fois, sans lire les blocs.
 * `aria-busy` porte l'information, les blocs sont `aria-hidden`.
 */
export function SkeletonRegion({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div role="status" aria-busy="true" aria-label={label}>
      {children}
    </div>
  )
}

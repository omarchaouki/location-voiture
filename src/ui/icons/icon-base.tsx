import type { SVGProps } from 'react'

/**
 * Base du jeu d'icônes maison.
 *
 * Contrat de dessin (docs/DESIGN.md §6) : grille 24, trait 1,75, terminaisons et
 * jointures rondes, `currentColor`, aucun remplissage. Dessin technique, pas « bulle ».
 *
 * Aucune bibliothèque d'icônes n'est installée dans ce projet : une icône manquante
 * se dessine, elle ne s'installe pas. Le hook de pré-commit refuse `lucide-react`,
 * `@heroicons/react` et consorts.
 */

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  /** Taille en pixels. Défaut 24, la grille de dessin. */
  size?: number
  /** Étiquette accessible. Sans elle, l'icône est décorative et masquée aux lecteurs d'écran. */
  title?: string
  /**
   * Icône directionnelle (flèche, chevron) : miroitée en RTL.
   * Ne JAMAIS activer sur une icône d'objet — une voiture retournée est une voiture cassée.
   */
  directional?: boolean
}

export function Icon({
  size = 24,
  title,
  directional = false,
  className,
  children,
  ...rest
}: IconProps & { children: React.ReactNode }) {
  const classes = [directional ? 'icon-directional' : '', className ?? '']
    .filter(Boolean)
    .join(' ')

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={classes || undefined}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  )
}

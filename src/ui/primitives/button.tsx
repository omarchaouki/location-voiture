import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANTS: Record<ButtonVariant, string> = {
  // L'accent ne sert qu'à l'action principale d'un écran. docs/DESIGN.md §2.
  primary: 'bg-stamp text-stamp-contrast border-stamp hover:opacity-90 active:opacity-95',
  secondary: 'bg-surface text-ink border-rule-strong hover:bg-surface-sunken',
  ghost: 'bg-transparent text-ink border-transparent hover:bg-surface-sunken',
  danger: 'bg-transparent text-danger border-danger hover:bg-danger-wash',
}

/*
 * `cursor-pointer` est explicite : Tailwind 4 a retiré la remise à zéro qui le
 * posait sur les boutons, et un bouton qui garde le curseur flèche ne se lit pas
 * comme cliquable (`cursor-pointer`, priorité 2 du référentiel).
 *
 * L'opacité de l'état désactivé est à 0,45 plutôt qu'à 0,5, et le curseur change :
 * un contrôle grisé doit être reconnaissable AVANT le clic, pas après.
 */
const BASE =
  'inline-flex cursor-pointer items-center justify-center gap-2 rounded-sm border px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45'

/**
 * Classes partagées entre `<Button>` et `<LinkButton>`.
 *
 * Elles existent séparément parce qu'un lien qui ressemble à un bouton DOIT rester
 * un `<a>` : imbriquer un `<button>` dans un `<a>` est invalide, le navigateur sort
 * le bouton de l'ancre, et le DOM ne correspond plus au rendu serveur — c'est une
 * erreur d'hydratation garantie.
 */
export function buttonClasses(variant: ButtonVariant = 'secondary', extra?: string): string {
  return `${BASE} ${VARIANTS[variant]} ${extra ?? ''}`.trim()
}

/** Hauteur minimale : cible tactile de 44 px (jeton `--tap-target`). */
export const BUTTON_STYLE = { minHeight: 'var(--tap-target)' } as const

/**
 * Bouton. Pas d'ombre, rayon 2 px, cible tactile de 44 px minimum.
 * Le focus visible vient de la règle globale `:focus-visible` de app.css et ne doit
 * jamais être neutralisé ici.
 */
export function Button({
  children,
  variant = 'secondary',
  iconStart,
  iconEnd,
  className,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode
  variant?: ButtonVariant
  iconStart?: ReactNode
  iconEnd?: ReactNode
}) {
  return (
    <button type={type} className={buttonClasses(variant, className)} style={BUTTON_STYLE} {...rest}>
      {iconStart}
      <span>{children}</span>
      {iconEnd}
    </button>
  )
}

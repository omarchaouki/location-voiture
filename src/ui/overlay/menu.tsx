// i18n-exempt — cette primitive ne produit aucun texte : elle reçoit un déclencheur
// et des enfants déjà traduits par l'appelant.

import { Link } from '@tanstack/react-router'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

/**
 * PREMIÈRE couche flottante du produit — et la seule à ce jour.
 *
 * `docs/DESIGN.md` §2 réserve l'ombre aux couches flottantes, dans
 * `src/ui/overlay/`. Ce dossier était prévu depuis la Phase 1 et restait vide :
 * jusqu'ici, rien ne flottait. Un menu de compte, lui, doit flotter — il recouvre le
 * contenu, donc il doit s'en détacher, et c'est exactement le cas que la charte
 * prévoyait. `--overlay-shadow` est utilisée ici, et nulle part ailleurs.
 *
 * Ce que cette primitive garantit, parce qu'un menu qui ne le fait pas est un piège :
 *
 *  - **Échap referme et rend le focus au déclencheur.** Sans cela, un utilisateur au
 *    clavier se retrouve dans le vide, derrière un panneau invisible.
 *  - **Un clic à l'extérieur referme.** Y compris sur mobile, où il n'y a pas d'`Échap`.
 *  - **`aria-expanded` et `aria-haspopup` sur le déclencheur**, `role="menu"` sur le
 *    panneau : un lecteur d'écran annonce « menu, replié » avant d'ouvrir.
 *  - **Le panneau se ferme après un choix** — sinon il reste ouvert par-dessus la page
 *    vers laquelle on vient de naviguer.
 */

export function Menu({
  label,
  trigger,
  children,
  align = 'end',
  width = 'default',
  appearance = 'button',
}: {
  /** Nom accessible du déclencheur, déjà traduit. */
  label: string
  trigger: ReactNode
  children: ReactNode
  /** Bord auquel le panneau s'aligne. Logique, donc miroité en RTL. */
  align?: 'start' | 'end'
  /**
   * Largeur du panneau. `compact` sert aux menus dont les entrées tiennent en un
   * mot — la langue, par exemple : un panneau de 288 px pour trois mots donne
   * l'impression d'un menu vide.
   */
  width?: 'default' | 'compact'
  /** Le déclencheur porte-t-il un cadre ? `bare` sert dans une barre déjà dense. */
  appearance?: 'button' | 'bare'
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setOpen(false)
      // Le focus REVIENT au déclencheur : c'est la moitié la plus oubliée de la règle.
      triggerRef.current?.focus()
    }

    function onPointerDown(event: PointerEvent) {
      if (containerRef.current?.contains(event.target as Node)) return
      setOpen(false)
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  return (
    /*
     * `inline-block` et non `block` : le panneau se positionne par rapport à CE
     * conteneur, et un `div` de bloc s'étire à la largeur du parent. Le menu
     * s'alignait alors sur le bord de la section, à des centaines de pixels du
     * déclencheur — invisible dans la barre de navigation (contexte flex), flagrant
     * sur la surface de vérification. Constaté à l'écran, en arabe.
     */
    <div ref={containerRef} className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
        className={`flex items-center gap-2 rounded-md px-3 text-sm transition-colors ${
          appearance === 'button'
            ? 'border border-rule-strong bg-surface hover:bg-surface-sunken'
            : 'text-muted hover:bg-surface-sunken hover:text-ink'
        }`}
        style={{ minHeight: 'var(--tap-target)' }}
      >
        {trigger}
      </button>

      {open ? (
        <div
          id={panelId}
          role="menu"
          aria-label={label}
          // Le panneau se referme sur tout choix : un menu qui survit à la navigation
          // reste ouvert par-dessus la page suivante.
          onClick={() => setOpen(false)}
          className={`absolute z-40 mt-2 max-w-[calc(100vw-2rem)] overflow-hidden rounded-md border border-rule bg-surface ${
            width === 'compact' ? 'w-48' : 'w-72'
          }`}
          style={{
            /* Le panneau ne peut jamais dépasser l'écran : sur un téléphone de
               375 px, 288 px de large plus une marge suffisent à sortir du cadre si
               le déclencheur est proche du bord. */
            boxShadow: 'var(--overlay-shadow)',
            insetInlineEnd: align === 'end' ? 0 : undefined,
            insetInlineStart: align === 'start' ? 0 : undefined,
          }}
        >
          {children}
        </div>
      ) : null}
    </div>
  )
}

/** Séparateur de groupe : un filet, comme partout ailleurs dans le produit. */
export function MenuSeparator() {
  return <div className="border-t border-rule" role="separator" />
}

/**
 * Une entrée de menu.
 *
 * `tone="danger"` n'est pas décoratif : les actions destructrices ou irréversibles
 * doivent être visuellement ET spatialement séparées des entrées ordinaires — c'est
 * la raison d'être du séparateur juste au-dessus de « Se déconnecter ».
 */
export function MenuItem({
  children,
  onSelect,
  tone = 'normal',
}: {
  children: ReactNode
  onSelect: () => void
  tone?: 'normal' | 'danger'
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className={`${ITEM_CLASS} ${tone === 'danger' ? 'text-danger' : ''}`}
      style={{ minHeight: 'var(--tap-target)' }}
    >
      {children}
    </button>
  )
}

const ITEM_CLASS =
  'flex w-full items-center gap-3 px-4 text-start text-sm transition-colors hover:bg-surface-sunken'

/**
 * Entrée de menu qui NAVIGUE.
 *
 * Elle reste un vrai lien (`<a href>`), pas un bouton qui appelle le routeur : le
 * sélecteur de langue en dépend pour rester indexable, ouvrable dans un nouvel
 * onglet, et porteur de `hreflang`. Un menu de langue fait de boutons perd les trois.
 *
 * Le panneau se referme tout seul : `Menu` intercepte le clic au niveau du panneau.
 */
export function MenuLink({
  children,
  to,
  params,
  current,
  ...rest
}: {
  children: ReactNode
  to: string
  params: Record<string, string>
  current?: boolean
  hrefLang?: string
  lang?: string
}) {
  return (
    <Link
      to={to}
      params={params}
      role="menuitem"
      aria-current={current ? 'true' : undefined}
      className={`${ITEM_CLASS} ${current ? 'font-medium text-stamp' : ''}`}
      style={{ minHeight: 'var(--tap-target)' }}
      {...rest}
    >
      {children}
    </Link>
  )
}

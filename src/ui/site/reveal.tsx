// i18n-exempt — cette primitive ne produit aucun texte : elle enveloppe celui des autres.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type CSSProperties,
  type ElementType,
  type ReactNode,
} from 'react'

/**
 * APPARITION AU DÉFILEMENT.
 *
 * La seule animation de la vitrine, et elle a un travail précis : dire « il y a autre
 * chose plus bas ». Sur une page de cinq écrans, un bloc qui arrive au moment où on
 * l'atteint fait comprendre qu'on avance ; un bloc déjà là depuis le début ne dit
 * rien. C'est la règle `motion-meaning` — une animation exprime une cause, sinon elle
 * ne sert qu'à faire attendre.
 *
 * Ce que ce fichier NE fait pas, et c'est l'essentiel :
 *
 *  - il n'anime ni hauteur, ni marge, ni position. `opacity` et `transform` sont les
 *    deux seules propriétés que le navigateur compose sans repasser par la mise en
 *    page ; tout le reste recalcule le document à chaque image ;
 *  - il ne glisse pas latéralement. Un déplacement horizontal devrait être écrit deux
 *    fois, une par sens de lecture, comme les tiroirs de `app.css`. Douze pixels vers
 *    le haut disent la même chose et se lisent pareil en arabe ;
 *  - il ne rejoue rien. Une fois révélé, l'observateur est débranché : une animation
 *    qui se rejoue à chaque passage transforme un défilement en clignotement.
 *
 * **Le mouvement réduit est traité DEUX fois**, ici et dans `app.css`, et ce n'est pas
 * une redite. La feuille annule l'état caché pour le cas où l'observateur n'atteint
 * jamais l'élément ; le crochet, lui, évite d'installer l'observateur du tout. La
 * règle globale de réduction ramène les durées à 0,01 ms — elle ne remet pas une
 * opacité nulle à un.
 */

/** 40 ms par carte : l'œil suit la séquence sans avoir l'impression d'attendre. */
const STAGGER_MS = 40

/**
 * Au-delà de la sixième carte, le retard cesse de croître.
 *
 * Sans ce plafond, la neuvième carte d'une grille arrive 360 ms après la première :
 * on regarde la page se construire au lieu de la lire. Six marches suffisent à faire
 * sentir un ordre.
 */
const MAX_STAGGER_STEPS = 6

export interface RevealState {
  /** Ref de RAPPEL : elle accepte n'importe quel élément, donc n'importe quelle balise. */
  ref: (node: HTMLElement | null) => void
  shown: boolean
}

export function useReveal(): RevealState {
  const [shown, setShown] = useState(false)
  const observerRef = useRef<IntersectionObserver | null>(null)

  // Démontage : on débranche. Un observateur laissé actif retient son élément.
  useEffect(() => () => observerRef.current?.disconnect(), [])

  const ref = useCallback((node: HTMLElement | null) => {
    observerRef.current?.disconnect()
    observerRef.current = null
    if (!node) return

    /*
     * Deux raisons de montrer tout de suite, et aucune n'est un cas limite :
     * quelqu'un qui a demandé moins de mouvement, et un navigateur sans observateur
     * d'intersection. Dans les deux cas, l'animation n'est pas dégradée — elle
     * n'existe simplement pas, et le contenu est là.
     */
    if (
      typeof IntersectionObserver === 'undefined' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setShown(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShown(true)
          observer.disconnect()
        }
      },
      /*
       * La marge NÉGATIVE en bas retarde le déclenchement jusqu'à ce que le bloc soit
       * franchement entré. Au premier pixel, l'animation se joue hors du champ de
       * vision : on ne voit que la fin, c'est-à-dire rien.
       */
      { rootMargin: '0px 0px -10% 0px', threshold: 0.01 },
    )

    observer.observe(node)
    observerRef.current = observer
  }, [])

  return { ref, shown }
}

/**
 * Le bloc qui apparaît.
 *
 * `index` échelonne les enfants d'une grille : passer le rang de la carte suffit, le
 * plafond et le pas sont décidés ici. `as` garde la balise SÉMANTIQUE — une section
 * reste une section, un élément de liste reste dans sa liste. Une animation ne doit
 * jamais coûter la structure du document.
 */
export function Reveal({
  as = 'div',
  index = 0,
  className,
  style,
  children,
  ...rest
}: {
  as?: 'div' | 'section' | 'article' | 'li' | 'figure' | 'ul' | 'ol'
  /** Rang dans une grille, pour l'échelonnement. Omis = aucun retard. */
  index?: number
  children: ReactNode
} & Omit<ComponentProps<'div'>, 'ref' | 'children'>) {
  const { ref, shown } = useReveal()
  const Tag = as as ElementType

  return (
    <Tag
      ref={ref}
      data-reveal={shown ? 'shown' : 'pending'}
      className={className}
      style={
        {
          ...style,
          '--reveal-delay': `${Math.min(index, MAX_STAGGER_STEPS) * STAGGER_MS}ms`,
        } as CSSProperties
      }
      {...rest}
    >
      {children}
    </Tag>
  )
}

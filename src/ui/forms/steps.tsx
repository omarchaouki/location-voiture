// i18n-exempt — cette primitive ne produit aucun texte : les libellés d'étape, les
// boutons et l'annonce de progression lui sont passés déjà traduits par l'appelant.

import { useCallback, useRef, useState } from 'react'

import { Button } from '~/ui/shadcn/button'
import { cn } from '~/ui/shadcn/utils'

/**
 * FORMULAIRE EN ÉTAPES.
 *
 * Quatorze champs sur un écran, c'est un mur. Le formulaire véhicule en aligne
 * quatorze, celui d'un client aussi, et le premier réflexe devant un mur est de le
 * remplir vite et mal — ou de partir. Trois groupes de cinq se remplissent.
 *
 * **Toutes les étapes restent MONTÉES**, cachées en CSS et non démontées. C'est le
 * choix qui décide de tout le reste :
 *
 *  - `new FormData(form)` ramasse l'ensemble des champs d'un coup, donc les écrans
 *    gardent leur soumission d'origine — aucun d'eux n'a eu à passer à un état React
 *    par champ pour devenir multi-étapes ;
 *  - revenir en arrière ne perd RIEN, parce qu'il n'y a rien à restaurer : les valeurs
 *    n'ont jamais quitté le DOM ;
 *  - le navigateur, lui, ne sait pas qu'une étape est cachée. Un champ `required`
 *    invisible fait échouer la soumission avec « An invalid form control is not
 *    focusable », sans message et sans rien montrer à l'utilisateur. D'où le
 *    `noValidate` posé sur l'élément de formulaire par `formProps`, et la validation conduite
 *    ici, étape par étape, pendant que l'étape est VISIBLE.
 *
 * Les messages de contrainte restent ceux du navigateur : ils sont déjà traduits dans
 * la langue du système, et personne ne les écrira mieux.
 */

export interface FormSteps {
  /** Étape affichée, à partir de 0. */
  index: number
  count: number
  isFirst: boolean
  isLast: boolean
  /** À poser sur l'élément de formulaire : la référence ET le `noValidate`. */
  formProps: { ref: React.RefObject<HTMLFormElement | null>; noValidate: true }
  next: () => void
  back: () => void
  goTo: (target: number) => void
  /** Enveloppe la soumission : elle ne passe que si TOUTES les étapes sont valides. */
  handleSubmit: (
    onValid: (event: React.FormEvent<HTMLFormElement>) => void,
  ) => (event: React.FormEvent<HTMLFormElement>) => void
  /**
   * Pose une erreur MÉTIER sur un champ nommé, et va la montrer.
   *
   * Le navigateur sait signaler « ce champ est obligatoire » ; il ne sait rien d'une
   * plaque marocaine ni d'un doublon en base. Ces refus-là arrivent après coup, depuis
   * la validation du domaine ou depuis le serveur — c'est-à-dire alors que la personne
   * est sur la DERNIÈRE étape, à trois écrans du champ fautif. Un message rouge en bas
   * de page qui dit « plaque invalide » sans montrer la plaque, c'est un cul-de-sac.
   *
   * On revient donc à l'étape du champ, et on emprunte la bulle native : même dessin,
   * même position, même comportement que les contraintes du navigateur.
   */
  reportFieldError: (name: string, message: string) => boolean
}

/** Les contrôles d'une étape donnée, dans l'ordre du document. */
function controlsOf(form: HTMLFormElement, step: number): HTMLElement[] {
  const pane = form.querySelector(`[data-step='${step}']`)
  if (!pane) return []
  return [...pane.querySelectorAll<HTMLElement>('input, select, textarea')]
}

function isValid(element: HTMLElement): boolean {
  const candidate = element as HTMLElement & { checkValidity?: () => boolean }
  return candidate.checkValidity ? candidate.checkValidity() : true
}

/**
 * Signale le premier champ fautif d'une étape, et rend la main.
 *
 * `reportValidity()` ouvre la bulle native ET met le focus — les deux comptent : la
 * bulle disparaît au premier clic ailleurs, le focus, lui, dit où reprendre.
 */
function reportFirstInvalid(form: HTMLFormElement, step: number): boolean {
  for (const control of controlsOf(form, step)) {
    if (isValid(control)) continue
    ;(control as HTMLInputElement).reportValidity()
    return false
  }
  return true
}

export function useFormSteps(count: number): FormSteps {
  const formRef = useRef<HTMLFormElement | null>(null)
  const [index, setIndex] = useState(0)

  const goTo = useCallback(
    (target: number) => {
      const clamped = Math.max(0, Math.min(count - 1, target))
      const form = formRef.current

      /*
       * Reculer est TOUJOURS gratuit. Avancer traverse les étapes une à une et
       * s'arrête à la première qui n'est pas remplie : sauter à l'étape 3 depuis la
       * barre de progression ne doit pas permettre d'enjamber un champ obligatoire de
       * l'étape 2, sinon la contrainte se découvre à la soumission, c'est-à-dire au
       * pire moment.
       */
      if (!form || clamped <= index) {
        setIndex(clamped)
        return
      }

      for (let step = index; step < clamped; step += 1) {
        if (!reportFirstInvalid(form, step)) {
          setIndex(step)
          return
        }
      }
      setIndex(clamped)
    },
    [count, index],
  )

  const next = useCallback(() => {
    goTo(index + 1)
  }, [goTo, index])

  const back = useCallback(() => {
    setIndex((current) => Math.max(0, current - 1))
  }, [])

  const handleSubmit = useCallback(
    (onValid: (event: React.FormEvent<HTMLFormElement>) => void) =>
      (event: React.FormEvent<HTMLFormElement>) => {
        const form = event.currentTarget

        /*
         * On repart de l'étape ZÉRO, pas de l'étape courante. Un champ peut avoir été
         * vidé après coup, et une soumission qui n'inspecte que la dernière étape
         * laisserait passer ce trou-là.
         */
        for (let step = 0; step < count; step += 1) {
          if (controlsOf(form, step).every(isValid)) continue
          event.preventDefault()
          setIndex(step)
          // Le champ fautif doit être VISIBLE pour que la bulle s'ouvre : on attend
          // que React ait rendu l'étape.
          requestAnimationFrame(() => reportFirstInvalid(form, step))
          return
        }

        onValid(event)
      },
    [count],
  )

  const reportFieldError = useCallback((name: string, message: string) => {
    const form = formRef.current
    if (!form) return false

    const control = form.elements.namedItem(name)
    const focusable =
      control instanceof HTMLInputElement ||
      control instanceof HTMLSelectElement ||
      control instanceof HTMLTextAreaElement
    if (!focusable) return false

    const pane = control.closest('[data-step]')
    const step = pane ? Number(pane.getAttribute('data-step')) : Number.NaN
    if (Number.isFinite(step)) setIndex(step)

    control.setCustomValidity(message)

    /*
     * La contrainte s'efface À LA PREMIÈRE FRAPPE, et c'est indispensable : une
     * `customValidity` posée une fois reste posée. Sans ce nettoyage, le champ resterait
     * invalide même corrigé, et le formulaire refuserait de partir sans plus rien dire.
     */
    const clear = () => {
      control.setCustomValidity('')
      control.removeEventListener('input', clear)
    }
    control.addEventListener('input', clear)

    // La bulle ne s'ouvre que sur un champ VISIBLE : on attend le rendu de l'étape.
    requestAnimationFrame(() => control.reportValidity())
    return true
  }, [])

  return {
    index,
    count,
    isFirst: index === 0,
    isLast: index === count - 1,
    formProps: { ref: formRef, noValidate: true },
    next,
    back,
    goTo,
    handleSubmit,
    reportFieldError,
  }
}

/**
 * La barre de progression.
 *
 * Une liste ORDONNÉE, pas une rangée de pastilles décoratives : `aria-current="step"`
 * dit où l'on est, et chaque étape franchie reste cliquable pour revenir corriger.
 * Un formulaire en étapes sans retour possible est un formulaire qu'on recommence.
 *
 * L'annonce vocale est séparée du dessin (`liveLabel`) : la barre se lit d'un coup
 * d'œil, un lecteur d'écran a besoin qu'on lui dise « étape 2 sur 3 ».
 */
export function StepProgress({
  labels,
  current,
  onGoTo,
  liveLabel,
  className,
}: {
  labels: readonly string[]
  current: number
  onGoTo: (target: number) => void
  /** Déjà traduite et interpolée : « Étape 2 sur 3 — Caractéristiques ». */
  liveLabel: string
  className?: string
}) {
  return (
    <div className={cn('grid gap-2', className)}>
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {labels.map((label, step) => {
          const done = step < current
          const active = step === current
          return (
            <li key={label} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onGoTo(step)}
                aria-current={active ? 'step' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-md px-2 py-1 text-xs font-medium transition-colors',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : done
                      ? 'text-primary hover:bg-accent'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                {/*
                  Le NUMÉRO reste un chiffre, jamais une coche : une coche sur une
                  étape franchie et un chiffre sur les autres font deux formes à
                  interpréter, et la couleur dit déjà l'état.
                */}
                <span
                  className={cn(
                    'numeric grid size-5 shrink-0 place-items-center rounded-full text-2xs',
                    active
                      ? 'bg-primary-foreground text-primary'
                      : done
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground',
                  )}
                  aria-hidden="true"
                >
                  {step + 1}
                </span>
                {label}
              </button>
              {/* Le trait de liaison, décoratif, saute après la dernière étape. */}
              {step < labels.length - 1 ? (
                <span aria-hidden="true" className="h-px w-4 bg-border" />
              ) : null}
            </li>
          )
        })}
      </ol>

      <span aria-live="polite" className="sr-only">
        {liveLabel}
      </span>
    </div>
  )
}

/**
 * Une étape.
 *
 * `data-step` n'est pas un attribut de style : c'est par lui que la validation
 * retrouve les champs d'une étape. Le retirer casse silencieusement le contrôle,
 * ce qui est la raison pour laquelle il est posé ici et pas par l'appelant.
 */
export function StepPane({
  index,
  current,
  className,
  children,
}: {
  index: number
  current: number
  className?: string
  children: React.ReactNode
}) {
  const active = index === current
  return (
    <div
      data-step={index}
      /* Caché en CSS, jamais démonté : les valeurs saisies restent dans le DOM. */
      className={active ? cn('grid gap-5 sm:grid-cols-2', className) : 'hidden'}
    >
      {children}
    </div>
  )
}

/**
 * Retour, Suivant, et l'envoi qui ne paraît qu'à la fin.
 *
 * Le bouton d'envoi n'existe QUE sur la dernière étape. Le montrer plus tôt, grisé ou
 * non, invite à sauter le reste — et un formulaire envoyé à moitié rempli revient en
 * erreur, ce qui coûte plus cher que l'étape qu'on croyait faire gagner.
 */
export function StepNav({
  steps,
  backLabel,
  nextLabel,
  submitLabel,
  busy = false,
  disabled = false,
  className,
}: {
  steps: FormSteps
  backLabel: string
  nextLabel: string
  submitLabel: string
  busy?: boolean
  disabled?: boolean
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-3', className)}>
      {steps.isFirst ? null : (
        <Button type="button" variant="outline" onClick={steps.back}>
          {backLabel}
        </Button>
      )}

      {steps.isLast ? (
        <Button type="submit" disabled={busy || disabled}>
          {submitLabel}
        </Button>
      ) : (
        <Button type="button" onClick={steps.next}>
          {nextLabel}
        </Button>
      )}
    </div>
  )
}

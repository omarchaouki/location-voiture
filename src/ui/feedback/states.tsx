import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '~/ui/shadcn/button'


/**
 * État vide : une phrase qui dit ce qui manque, et le bouton qui le crée.
 * Pas d'illustration, pas d'excuse. docs/DESIGN.md §7.
 */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string
  body?: string
  action?: ReactNode
}) {
  return (
    <div className="border-y border-border px-4 py-10 text-center">
      <p className="text-lg">{title}</p>
      {body ? <p className="mx-auto mt-2 max-w-prose text-sm text-muted-foreground">{body}</p> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  )
}

/**
 * État d'erreur : ce qui s'est passé, ce qu'on peut faire, la référence à donner.
 * Pas de « Oups ! », pas de « Nous sommes désolés ».
 */
export function ErrorState({
  error,
  reset,
}: {
  error: unknown
  reset?: () => void
}) {
  const { t } = useTranslation()
  const reference = referenceOf(error)

  return (
    <div className="border-y-2 border-destructive px-4 py-8">
      <p className="text-lg text-destructive">{t('error.genericTitle')}</p>
      <p className="mt-2 max-w-prose text-sm">{t('error.genericBody')}</p>
      {reference ? (
        <p className="mt-3 text-xs text-muted-foreground">
          {t('error.reference')} <span className="numeric">{reference}</span>
        </p>
      ) : null}
      {reset ? (
        <div className="mt-5">
          <Button onClick={reset}>{t('action.retry')}</Button>
        </div>
      ) : null}
    </div>
  )
}

export function NotFoundState() {
  const { t } = useTranslation()

  return (
    <div className="px-4 py-16 text-center">
      <p className="text-2xl">{t('error.notFoundTitle')}</p>
      <p className="mx-auto mt-3 max-w-prose text-sm text-muted-foreground">{t('error.notFoundBody')}</p>
    </div>
  )
}

/**
 * Une référence courte et stable, à donner au support. On n'affiche jamais le
 * message brut du serveur : il peut contenir des détails d'implémentation.
 */
function referenceOf(error: unknown): string | null {
  if (error instanceof Error && error.message.length > 0) {
    let hash = 0
    for (let index = 0; index < error.message.length; index += 1) {
      hash = (hash * 31 + error.message.charCodeAt(index)) | 0
    }
    return Math.abs(hash).toString(36).toUpperCase().slice(0, 6)
  }
  return null
}

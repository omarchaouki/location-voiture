import { useState } from 'react'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { authClient } from '~/auth/client'
import { DEFAULT_LOCALE, isLocale } from '~/i18n/locales'
import { fetchViewer } from '~/server/session'
import { Button } from '~/ui/primitives/button'

/**
 * Connexion.
 *
 * Il n'y a pas de page « créer un compte » : l'accès se fait sur invitation
 * (cahier des charges §1). Le refus est aussi appliqué côté serveur, sur l'endpoint
 * d'inscription — l'absence de page ne protège rien à elle seule.
 */
export const Route = createFileRoute('/$lang/connexion')({
  beforeLoad: async ({ params }) => {
    const viewer = await fetchViewer()
    if (!viewer) return
    const lang = isLocale(params.lang) ? params.lang : DEFAULT_LOCALE
    throw redirect({
      to: viewer.isPlatformOwner ? '/$lang/admin' : '/$lang/app',
      params: { lang },
    })
  },
  component: SignInPage,
})

/** Même géométrie que les champs partagés (`src/ui/forms/fields.tsx`). */
const INPUT_CLASS =
  'mt-1 block w-full rounded-sm border border-rule-strong bg-surface px-3 py-2 text-base transition-colors focus:border-stamp'

function SignInPage() {
  const { t } = useTranslation()
  const { lang } = Route.useParams()
  const locale = isLocale(lang) ? lang : DEFAULT_LOCALE
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setFailed(false)

    const result = await authClient.signIn.email({ email, password })

    if (result.error) {
      // Message unique : on ne dit jamais si c'est l'adresse ou le mot de passe qui
      // est faux, cela révélerait quels comptes existent.
      setFailed(true)
      setBusy(false)
      return
    }

    const viewer = await fetchViewer()
    await navigate({
      to: viewer?.isPlatformOwner ? '/$lang/admin' : '/$lang/app',
      params: { lang: locale },
    })
  }

  return (
    /*
      La connexion est la seule page du produit qui n'a qu'une chose à faire. Elle est
      donc centrée, seule sur sa carte, et ne montre rien d'autre : pas de navigation,
      pas de colonne latérale, aucune sortie. Chaque élément supplémentaire y est une
      occasion de ne pas se connecter.
    */
    <div className="mx-auto flex max-w-md flex-col justify-center py-6 sm:min-h-[70vh]">
      <h1 className="font-display text-xl font-semibold tracking-tight">
        {t('auth.signInTitle')}
      </h1>
      <p className="mt-2 text-sm text-muted">{t('auth.signInIntro')}</p>

      {/*
        `method="post"` alors que la soumission est interceptée par React.

        Ce n'est pas redondant : c'est le comportement du jour où le JavaScript ne
        s'exécute pas. Sans lui, le navigateur soumet en GET et place l'adresse ET LE
        MOT DE PASSE dans l'URL — donc dans l'historique, dans les journaux du serveur
        et dans l'en-tête `Referer`. Arrivé le 25/08/2026 : une erreur d'import avait
        empêché l'hydratation, et le formulaire est reparti en GET.

        En POST, la même panne produit une requête sans effet au lieu d'une fuite.
      */}
      <form
        method="post"
        className="mt-6 rounded-md border border-rule bg-surface p-5 shadow-card"
        onSubmit={(event) => void submit(event)}
      >
        <label className="block">
          <span className="text-xs text-muted">{t('auth.email')}</span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={INPUT_CLASS}
            style={{ minHeight: 'var(--tap-target)' }}
          />
        </label>

        <label className="mt-5 block">
          <span className="text-xs text-muted">{t('auth.password')}</span>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={INPUT_CLASS}
            style={{ minHeight: 'var(--tap-target)' }}
          />
        </label>

        {failed ? (
          <p role="alert" className="mt-5 border-s-2 border-danger ps-3 text-sm text-danger">
            {t('auth.signInFailed')}
          </p>
        ) : null}

        <div className="mt-6">
          <Button type="submit" variant="primary" disabled={busy} className="w-full">
            {busy ? t('auth.working') : t('auth.signIn')}
          </Button>
        </div>
      </form>
    </div>
  )
}

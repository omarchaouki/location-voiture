import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { authClient } from '~/auth/client'
import { DEFAULT_LOCALE, isLocale } from '~/i18n/locales'
import { fetchViewer } from '~/server/session'
import { Alert } from '~/ui/shadcn/alert'
import { Button } from '~/ui/shadcn/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/ui/shadcn/card'
import { Field, Input } from '~/ui/shadcn/field'

/**
 * Connexion.
 *
 * Il n'y a pas de page « créer un compte » : l'accès se fait sur invitation (cahier
 * des charges §1). Le refus est aussi appliqué côté serveur, sur l'endpoint
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
    <div className="mx-auto flex w-full max-w-md flex-col justify-center py-6 sm:min-h-[70vh]">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg tracking-tight">{t('auth.signInTitle')}</CardTitle>
          <CardDescription className="text-sm">{t('auth.signInIntro')}</CardDescription>
        </CardHeader>

        <CardContent>
          {/*
            `method="post"` alors que la soumission est interceptée par React.

            Ce n'est pas redondant : c'est le comportement du jour où le JavaScript ne
            s'exécute pas. Sans lui, le navigateur soumet en GET et place l'adresse ET
            LE MOT DE PASSE dans l'URL — donc dans l'historique, dans les journaux du
            serveur et dans l'en-tête `Referer`. Arrivé le 25/08/2026 : une erreur
            d'import avait empêché l'hydratation, et le formulaire est reparti en GET.

            En POST, la même panne produit une requête sans effet au lieu d'une fuite.
          */}
          <form method="post" className="grid gap-5" onSubmit={(event) => void submit(event)}>
            <Field label={t('auth.email')} htmlFor="signin-email">
              <Input
                id="signin-email"
                type="email"
                name="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>

            <Field label={t('auth.password')} htmlFor="signin-password">
              <Input
                id="signin-password"
                type="password"
                name="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>

            {failed ? (
              <Alert role="alert" variant="destructive">
                {t('auth.signInFailed')}
              </Alert>
            ) : null}

            <Button type="submit" disabled={busy} className="w-full">
              {busy ? t('auth.working') : t('auth.signIn')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

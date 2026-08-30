import { useMutation } from '@tanstack/react-query'
import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { authClient } from '~/auth/client'
import { DEFAULT_LOCALE, isLocale } from '~/i18n/locales'
import { fetchViewer } from '~/server/session'
import { useHydrated } from '~/ui/forms/use-hydrated'
import { Alert } from '~/ui/shadcn/alert'
import { Button } from '~/ui/shadcn/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/ui/shadcn/card'
import { Field, Input } from '~/ui/shadcn/field'

/**
 * Connexion.
 *
 * **Elle a une sortie, depuis le 28/08/2026 : « créer mon espace ».** L'accès ne se
 * fait plus uniquement sur invitation — `/$lang/inscription` monte l'agence, son
 * abonnement d'essai et son compte propriétaire d'un geste. Le lien vit en bas de
 * page, hors de la carte de connexion : c'est la seule sortie tolérée ici, parce que
 * son absence coûtait plus cher que sa présence. Quelqu'un qui arrive sans compte et
 * ne trouve aucun chemin ne cherche pas le formulaire d'inscription, il ferme
 * l'onglet.
 *
 * L'endpoint d'inscription de Better Auth, lui, reste fermé : il n'accepte que les
 * adresses ouvertes le temps d'une création par le serveur (`src/auth/server.ts`).
 * L'absence — ou la présence — d'une page ne protège rien à elle seule.
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
  const hydrated = useHydrated()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  /**
   * La connexion est une MUTATION, pas un `useState` de plus.
   *
   * Le gain n'est pas théorique : `TopProgress` compte les mutations en vol
   * (`useIsMutating`), donc la barre du haut s'allume pendant l'appel. Avant, l'écran
   * ne bougeait pas d'un pixel entre le clic et la redirection, et le seul indice que
   * quelque chose se passait était le libellé du bouton.
   */
  const signIn = useMutation({
    mutationFn: async (credentials: { email: string; password: string }) => {
      const result = await authClient.signIn.email(credentials)
      // Better Auth ne LÈVE pas sur un refus : il rend `{ error }`. Sans ce test, la
      // mutation « réussit » et on redirige vers un espace où l'on n'entrera pas.
      if (result.error) throw new Error('signin_refused')

      const viewer = await fetchViewer()
      return { isPlatformOwner: viewer?.isPlatformOwner === true }
    },
    onSuccess: async ({ isPlatformOwner }) => {
      await navigate({
        to: isPlatformOwner ? '/$lang/admin' : '/$lang/app',
        params: { lang: locale },
      })
    },
  })

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
            serveur et dans l'en-tête `Referer`.

            Mais la ceinture avait un angle mort, corrigé le 26/08/2026 : entre
            l'affichage du HTML et la fin de l'hydratation, valider envoyait un POST
            NATIF. La page se rechargeait et personne ne se connectait. Le bouton
            attend donc `useHydrated()` — voir src/ui/forms/use-hydrated.ts.
          */}
          <form
            method="post"
            className="grid gap-5"
            onSubmit={(event) => {
              event.preventDefault()
              signIn.mutate({ email, password })
            }}
          >
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

            {signIn.isError ? (
              /* Message unique : on ne dit jamais si c'est l'adresse ou le mot de
                 passe qui est faux, cela révélerait quels comptes existent. */
              <Alert role="alert" variant="destructive">
                {t('auth.signInFailed')}
              </Alert>
            ) : null}

            <Button
              type="submit"
              disabled={!hydrated || signIn.isPending || signIn.isSuccess}
              className="w-full"
            >
              {signIn.isPending || signIn.isSuccess ? t('auth.working') : t('auth.signIn')}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/*
        La sortie, SOUS la carte et non dedans.

        Dans la carte, elle rivaliserait avec le bouton « Se connecter » — deux actions
        de même poids sur un écran qui n'a qu'une chose à faire. Dessous, elle ne se
        voit que si on la cherche, ce qui est exactement le cas de quelqu'un qui n'a
        pas de compte.
      */}
      <p className="mt-4 text-center text-sm text-muted-foreground">
        {t('auth.noAccount')}{' '}
        <Link
          to="/$lang/inscription"
          params={{ lang: locale }}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {t('auth.createAccount')}
        </Link>
      </p>
    </div>
  )
}

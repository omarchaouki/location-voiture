import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { DEFAULT_LOCALE, isLocale, type Locale } from '~/i18n/locales'
import { listPublicPlans } from '~/server/pricing'
import { fetchViewer } from '~/server/session'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/ui/shadcn/card'
import { RegisterForm } from '~/ui/site/register-form'

/**
 * OUVRIR UN ESPACE — la page qui remplace « demander une démonstration ».
 *
 * L'offre peut être présélectionnée par la barre d'adresse (`?offre=pro`) : c'est ce
 * qui permet à chaque carte de la page tarifaire de mener ici avec le bon tarif déjà
 * coché, plutôt que de faire recommencer le choix qu'on vient de faire. Le paramètre
 * n'AUTORISE rien — le serveur relit l'offre en base et refuse tout ce qui n'est pas
 * public (`src/server/signup-intake.ts`).
 *
 * Déjà connecté, on n'a rien à faire ici : la redirection est la même que sur la page
 * de connexion, et pour la même raison — un formulaire d'inscription proposé à qui a
 * déjà un espace est une invitation à en créer un second par erreur.
 */
export const Route = createFileRoute('/$lang/inscription')({
  validateSearch: z.object({ offre: z.string().optional() }),

  beforeLoad: async ({ params }) => {
    const viewer = await fetchViewer()
    if (!viewer) return
    const lang = isLocale(params.lang) ? params.lang : DEFAULT_LOCALE
    throw redirect({
      to: viewer.isPlatformOwner ? '/$lang/admin' : '/$lang/app',
      params: { lang },
    })
  },

  loader: async () => ({ plans: await listPublicPlans() }),
  component: RegisterPage,
})

function RegisterPage() {
  const { t } = useTranslation()
  const { lang } = Route.useParams()
  const locale: Locale = isLocale(lang) ? lang : DEFAULT_LOCALE
  const { plans } = Route.useLoaderData()
  const { offre } = Route.useSearch()

  /*
   * L'offre conseillée sert de valeur par défaut quand l'adresse n'en impose pas.
   *
   * Aucun code d'offre n'est écrit ici : la marque « conseillée » vient de la base
   * (`plan_features`), exactement comme sur la page tarifaire. Un formulaire sans
   * choix coché fait porter la décision au visiteur avant qu'il ait de quoi la
   * prendre — et un formulaire dont rien n'est coché ne se soumet pas.
   */
  const fallback = plans.find((plan) => plan.isRecommended)?.code ?? plans[0]?.code
  const selected = plans.some((plan) => plan.code === offre) ? offre : fallback

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col justify-center gap-4 py-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg tracking-tight">{t('signup.title')}</CardTitle>
          <CardDescription className="text-sm">{t('signup.intro')}</CardDescription>
        </CardHeader>
      </Card>

      <RegisterForm
        plans={plans}
        locale={locale}
        {...(selected === undefined ? {} : { defaultPlanCode: selected })}
      />

      <Card>
        <CardContent className="text-sm text-muted-foreground">
          {t('signup.haveAccount')}{' '}
          <Link
            to="/$lang/connexion"
            params={{ lang: locale }}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {t('auth.signIn')}
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}

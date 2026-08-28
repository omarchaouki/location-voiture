import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowRight, Check } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DEFAULT_BILLING_PERIOD, type BillingPeriod } from '~/core/billing'
import type { FleetSize } from '~/core/schemas/lead'
import { DEFAULT_LOCALE, isLocale, type Locale } from '~/i18n/locales'
import { listPublicPlans } from '~/server/pricing'
import {
  AlertIcon,
  BranchIcon,
  ContractSignedIcon,
  FineIcon,
  GpsIcon,
  InvoiceIcon,
  type IconProps,
} from '~/ui/icons'
import { Badge } from '~/ui/shadcn/badge'
import { Button } from '~/ui/shadcn/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/ui/shadcn/card'
import { AppShowcase } from '~/ui/site/app-showcase'
import { PlanQuiz } from '~/ui/site/plan-quiz'
import { PricingSection } from '~/ui/site/pricing'
import { Reveal } from '~/ui/site/reveal'
import { SignupForm } from '~/ui/site/signup-form'

/**
 * SITE VITRINE.
 *
 * Trois principes tenus ici, et le troisième est le seul qui compte vraiment :
 *
 *  1. **Les tarifs sont LUS EN BASE**, jamais écrits dans la page — la remise annuelle
 *     comprise, qui est CALCULÉE (`monthsFreeOnYearly`). Un prix codé dans le JSX finit
 *     toujours par contredire celui de la facture.
 *  2. **Rien n'est promis qui n'existe pas.** Chaque promesse de cette page correspond
 *     à un écran livré.
 *  3. **Le formulaire demande deux champs obligatoires**, un nom et un numéro. Chaque
 *     champ obligatoire de plus coûte des prospects.
 *
 * **Refonte « conversion » du 28/08/2026.** L'ordre des sections est celui d'une
 * objection levée après l'autre, et il n'est pas décoratif : on montre le produit
 * (`AppShowcase`) AVANT de l'expliquer, parce qu'une capture répond en une seconde à
 * « à quoi ça ressemble » — la question que le visiteur se pose pendant qu'il lit la
 * liste des fonctionnalités. Le prix vient après la preuve, jamais avant.
 */
export const Route = createFileRoute('/$lang/')({
  loader: async () => ({ plans: await listPublicPlans() }),
  component: HomePage,
})

function HomePage() {
  const { lang } = Route.useParams()
  const locale: Locale = isLocale(lang) ? lang : DEFAULT_LOCALE
  const { plans } = Route.useLoaderData()

  /*
   * La taille de flotte vit ICI, au-dessus des deux sections qui s'en servent.
   *
   * Le questionnaire la demande en première question ; le formulaire la redemandait
   * une seconde fois, deux écrans plus bas. Redemander à quelqu'un ce qu'il vient de
   * répondre est la façon la plus sûre de le perdre au dernier champ — la réponse
   * descend donc du questionnaire vers le formulaire.
   */
  const [fleetSize, setFleetSize] = useState<FleetSize>('1-5')

  /*
   * LE RYTHME DE PAIEMENT vit ici pour la même raison : la grille tarifaire et le
   * résultat du questionnaire doivent annoncer le MÊME prix. Deux états séparés
   * auraient fini par diverger — on bascule en mensuel dans la grille, le
   * questionnaire continue de conseiller au tarif annuel, et l'écart se découvre au
   * moment de la facture.
   *
   * La valeur par défaut vient du domaine, pas d'un littéral : l'annuel d'abord.
   */
  const [period, setPeriod] = useState<BillingPeriod>(DEFAULT_BILLING_PERIOD)

  return (
    /*
     * `pb-action-bar` réserve la hauteur de la barre d'action du téléphone. Sans elle,
     * la barre recouvre la fin de la page — c'est-à-dire le bouton d'envoi du
     * formulaire, exactement ce qu'on cherche à faire atteindre.
     */
    <div className="-my-8 pb-action-bar">
      <Hero locale={locale} />
      <AppShowcase locale={locale} />
      <Capabilities />
      <MadeForMorocco />
      <PricingSection plans={plans} locale={locale} period={period} onPeriod={setPeriod} />
      <PlanQuiz plans={plans} locale={locale} period={period} onFleetSize={setFleetSize} />
      <SignupForm locale={locale} fleetSize={fleetSize} onFleetSize={setFleetSize} />

      <MobileCallToAction />
    </div>
  )
}

/**
 * L'accroche.
 *
 * Volontairement SOBRE. Une ligne de contexte en petit, un titre, une phrase, et UNE
 * action principale — la connexion vit dans l'en-tête, pas ici, et n'a donc pas à se
 * disputer l'attention avec la demande de démonstration (`primary-action`).
 *
 * L'entrée est ÉCHELONNÉE : le cachet, puis le titre, puis la phrase, puis les
 * boutons, à quarante millisecondes d'écart. Ce n'est pas un effet — c'est l'ordre
 * dans lequel on veut que ce soit lu, rendu visible. Tout arriver en même temps ne
 * hiérarchise rien.
 */
function Hero({ locale }: { locale: Locale }) {
  const { t } = useTranslation()

  return (
    <section className="border-b border-border py-14 sm:py-20">
      <div className="max-w-3xl">
        <Reveal index={0}>
          <Badge variant="secondary">{t('site.badge')}</Badge>
        </Reveal>

        <Reveal index={1}>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">
            {t('site.heroTitle')}
          </h1>
        </Reveal>

        <Reveal index={2}>
          <p className="mt-4 max-w-2xl text-base text-muted-foreground">{t('site.heroBody')}</p>
        </Reveal>

        <Reveal index={3}>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            {/* Un lien reste un <a> : jamais de <button> imbriqué dans une ancre. */}
            <Button asChild size="lg">
              <a href="#demo">
                <span>{t('site.requestDemo')}</span>
                {/* Flèche DIRECTIONNELLE : elle se retourne en arabe. */}
                <ArrowRight className="icon-directional" aria-hidden="true" />
              </a>
            </Button>
            <Button asChild variant="ghost" size="lg">
              <Link to="/$lang/connexion" params={{ lang: locale }}>
                {t('auth.signIn')}
              </Link>
            </Button>
          </div>
        </Reveal>

        {/*
          LES TROIS RÉASSURANCES, juste sous le bouton.
          C'est l'endroit où se pose la dernière hésitation avant le clic : ce qu'on
          engage, ce que ça coûte, et si on peut partir. Trois lignes courtes y
          répondent mieux qu'un paragraphe qui ne sera pas lu.
        */}
        <Reveal index={4}>
          <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2">
            {(['noCard', 'setup', 'cancel'] as const).map((point) => (
              <li key={point} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Check className="size-3.5 shrink-0 text-success" aria-hidden="true" />
                <span>{t(`site.trust.${point}`)}</span>
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal index={5}>
          <p className="mt-5 text-xs text-muted-foreground">{t('site.heroNote')}</p>
        </Reveal>
      </div>
    </section>
  )
}

/**
 * BARRE D'ACTION DU TÉLÉPHONE.
 *
 * Elle n'existe que sous 640 px, et pour une raison mesurable : la page fait six
 * écrans de haut sur un téléphone. Le bouton de l'accroche sort du champ dès le
 * deuxième, et il n'y en a plus aucun avant le formulaire. Remonter pour agir est
 * exactement ce qu'on ne fait pas — on ferme.
 *
 * Elle est masquée À L'IMPRESSION par `data-print`, jamais par `print:hidden` : ces
 * utilitaires n'ont aucune spécificité de plus que le `flex` qu'ils doivent battre, et
 * qui l'emporte dépend de l'ordre des variantes Tailwind.
 */
function MobileCallToAction() {
  const { t } = useTranslation()

  return (
    <div
      data-print="hide"
      className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 px-4 pt-2 backdrop-blur sm:hidden"
    >
      <Button asChild size="lg" className="w-full">
        <a href="#demo">
          <span>{t('site.requestDemo')}</span>
          <ArrowRight className="icon-directional" aria-hidden="true" />
        </a>
      </Button>
    </div>
  )
}

const CAPABILITIES: ReadonlyArray<{
  key: string
  icon: (props: IconProps) => React.ReactElement
}> = [
  { key: 'deadlines', icon: AlertIcon },
  { key: 'contracts', icon: ContractSignedIcon },
  { key: 'gps', icon: GpsIcon },
  { key: 'fines', icon: FineIcon },
  { key: 'invoicing', icon: InvoiceIcon },
  { key: 'branches', icon: BranchIcon },
]

/**
 * Ce que le produit fait — six affirmations, six écrans livrés.
 *
 * Les icônes viennent du jeu MAISON et non de lucide, et c'est un choix, pas un
 * oubli : ce sont des objets de métier — une échéance, un contrat signé, un boîtier
 * GPS, un PV, une facture, une agence. Aucune bibliothèque générique ne les dessine
 * juste, et ce sont eux qui font que la page ne ressemble pas à un gabarit.
 */
function Capabilities() {
  const { t } = useTranslation()

  return (
    <Reveal as="section" className="border-b border-border py-14 sm:py-16">
      <h2 className="text-lg font-semibold tracking-tight">{t('site.capabilitiesTitle')}</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t('site.capabilitiesBody')}</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CAPABILITIES.map((capability, index) => (
          <Reveal key={capability.key} index={index}>
            <Card className="h-full gap-3">
              <CardHeader>
                <span className="flex size-9 items-center justify-center rounded-md bg-accent text-primary">
                  <capability.icon size={19} />
                </span>
                <CardTitle className="mt-3 text-base">
                  {t(`site.capability.${capability.key}.title`)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-sm">
                  {t(`site.capability.${capability.key}.body`)}
                </CardDescription>
              </CardContent>
            </Card>
          </Reveal>
        ))}
      </div>
    </Reveal>
  )
}

/**
 * La section qui justifie le produit.
 *
 * Quatre détails que n'importe quel outil de gestion de flotte étranger rate, et
 * qu'un loueur marocain reconnaît immédiatement. Ce ne sont pas des arguments de
 * vente inventés : chacun correspond à une décision écrite dans `docs/DECISIONS.md`
 * et à un test qui échoue si on la casse.
 *
 * Pas de cartes ici, à dessein : quatre affirmations argumentées se lisent en
 * colonnes de texte. Les enfermer dans des cartes leur donnerait le même poids visuel
 * que les six capacités ci-dessus, qui elles se survolent.
 */
function MadeForMorocco() {
  const { t } = useTranslation()
  const points = ['plates', 'arabic', 'time', 'money'] as const

  return (
    <Reveal as="section" className="border-b border-border py-14 sm:py-16">
      <h2 className="text-lg font-semibold tracking-tight">{t('site.localTitle')}</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t('site.localBody')}</p>

      <ul className="mt-8 grid gap-x-12 gap-y-2 sm:grid-cols-2">
        {points.map((point, index) => (
          <Reveal as="li" key={point} index={index} className="border-t border-border py-5">
            <h3 className="text-sm font-semibold">{t(`site.local.${point}.title`)}</h3>
            <p className="mt-1.5 text-sm text-muted-foreground">{t(`site.local.${point}.body`)}</p>
          </Reveal>
        ))}
      </ul>
    </Reveal>
  )
}

import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { FLEET_SIZES } from '~/core/schemas/lead'
import { formatMoney, formatNumber } from '~/i18n/format'
import { DEFAULT_LOCALE, isLocale, type Locale } from '~/i18n/locales'
import { submitLead } from '~/server/leads'
import { listPublicPlans, type PublicPlan } from '~/server/pricing'
import {
  AlertIcon,
  BranchIcon,
  ContractSignedIcon,
  FineIcon,
  GpsIcon,
  InvoiceIcon,
  type IconProps,
} from '~/ui/icons'
import { CityCombobox } from '~/ui/forms/city-combobox'
import { choiceField, textField } from '~/ui/forms/form-data'
import { useHydrated } from '~/ui/forms/use-hydrated'
import { Alert } from '~/ui/shadcn/alert'
import { Badge } from '~/ui/shadcn/badge'
import { Button } from '~/ui/shadcn/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/ui/shadcn/card'
import { Field, Input, Select, Textarea } from '~/ui/shadcn/field'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '~/ui/shadcn/table'

/**
 * SITE VITRINE.
 *
 * Trois principes tenus ici, et le troisième est le seul qui compte vraiment :
 *
 *  1. **Les tarifs sont LUS EN BASE**, jamais écrits dans la page. Un prix codé dans
 *     le JSX finit toujours par contredire celui de la facture.
 *  2. **Rien n'est promis qui n'existe pas.** Chaque promesse de cette page
 *     correspond à un écran livré.
 *  3. **Le formulaire demande deux champs obligatoires**, un nom et un numéro. Chaque
 *     champ obligatoire de plus coûte des prospects, et un premier contact n'a pas
 *     besoin de connaître la taille de la flotte.
 *
 * **Refonte shadcn/ui du 26/08/2026.** Ce qui a changé tient en une phrase : les
 * sections ne sont plus séparées par des filets nus, elles sont posées sur des
 * surfaces qui se lisent d'un coup d'œil. Ce qui n'a PAS changé : l'échelle
 * typographique, les jetons de couleur, les propriétés logiques, et le fait que
 * chaque icône de métier reste dessinée à la main.
 */
export const Route = createFileRoute('/$lang/')({
  loader: async () => ({ plans: await listPublicPlans() }),
  component: HomePage,
})

function HomePage() {
  const { lang } = Route.useParams()
  const locale: Locale = isLocale(lang) ? lang : DEFAULT_LOCALE
  const { plans } = Route.useLoaderData()

  return (
    <div className="-my-8">
      <Hero locale={locale} />
      <Capabilities />
      <MadeForMorocco />
      <Pricing plans={plans} locale={locale} />
      <DemoForm locale={locale} />
    </div>
  )
}

/**
 * L'accroche.
 *
 * Volontairement SOBRE. Une ligne de contexte en petit, un titre, une phrase, et UNE
 * action principale — la connexion vit dans l'en-tête, pas ici, et n'a donc pas à se
 * disputer l'attention avec la demande de démonstration (`primary-action`).
 */
function Hero({ locale }: { locale: Locale }) {
  const { t } = useTranslation()

  return (
    <section className="border-b border-rule py-14 sm:py-20">
      <div className="max-w-3xl">
        <Badge variant="secondary">{t('site.badge')}</Badge>

        <h1 className="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">
          {t('site.heroTitle')}
        </h1>
        <p className="mt-4 max-w-2xl text-md text-muted">{t('site.heroBody')}</p>

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

        <p className="mt-5 text-xs text-muted">{t('site.heroNote')}</p>
      </div>
    </section>
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
    <section className="border-b border-rule py-14 sm:py-16">
      <h2 className="text-lg font-semibold tracking-tight">{t('site.capabilitiesTitle')}</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted">{t('site.capabilitiesBody')}</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CAPABILITIES.map((capability) => (
          <Card key={capability.key} className="gap-3">
            <CardHeader>
              <span className="flex size-9 items-center justify-center rounded-md bg-stamp-wash text-stamp">
                <capability.icon size={19} />
              </span>
              <CardTitle className="mt-3 text-md">
                {t(`site.capability.${capability.key}.title`)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-sm">
                {t(`site.capability.${capability.key}.body`)}
              </CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
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
    <section className="border-b border-rule py-14 sm:py-16">
      <h2 className="text-lg font-semibold tracking-tight">{t('site.localTitle')}</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted">{t('site.localBody')}</p>

      <ul className="mt-8 grid gap-x-12 gap-y-2 sm:grid-cols-2">
        {points.map((point) => (
          <li key={point} className="border-t border-rule py-5">
            <h3 className="text-sm font-semibold">{t(`site.local.${point}.title`)}</h3>
            <p className="mt-1.5 text-sm text-muted">{t(`site.local.${point}.body`)}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Les offres, lues en base.
 *
 * Un TABLEAU de comparaison, pas quatre cartes de prix. Quatre cartes côte à côte
 * obligent à faire l'aller-retour des yeux pour comparer une limite d'une offre à
 * l'autre ; une ligne par offre et une colonne par limite permettent de lire
 * « voitures » en travers. Le tableau défile dans sa boîte sous 768 px — jamais la
 * page.
 */
function Pricing({ plans, locale }: { plans: readonly PublicPlan[]; locale: Locale }) {
  const { t } = useTranslation()

  return (
    <section className="border-b border-rule py-14 sm:py-16">
      <h2 className="text-lg font-semibold tracking-tight">{t('site.pricingTitle')}</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted">{t('site.pricingBody')}</p>

      <Card className="mt-8 py-0">
        <Table>
          <TableCaption className="sr-only">{t('site.pricingTitle')}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>{t('billing.plan')}</TableHead>
              <TableHead className="text-end">{t('billing.perMonth')}</TableHead>
              <TableHead className="text-end">{t('site.limitVehicles')}</TableHead>
              <TableHead className="text-end">{t('site.limitUsers')}</TableHead>
              <TableHead className="text-end">{t('site.limitBranches')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {plans.map((plan) => (
              <TableRow key={plan.code}>
                <TableCell>
                  <span className="font-medium">{t(plan.nameKey)}</span>
                  {plan.trialDays > 0 ? (
                    <span className="block text-xs text-muted">
                      {t('site.trialDays', { days: plan.trialDays })}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="numeric text-end font-medium">
                  {formatMoney(plan.monthlyCents, locale, plan.currency, { withDecimals: false })}
                </TableCell>
                <TableCell className="numeric text-end">
                  <Limit value={plan.maxVehicles} locale={locale} />
                </TableCell>
                <TableCell className="numeric text-end">
                  <Limit value={plan.maxUsers} locale={locale} />
                </TableCell>
                <TableCell className="numeric text-end text-muted">
                  <Limit value={plan.maxBranches} locale={locale} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <p className="mt-3 text-xs text-muted">{t('site.pricingNote')}</p>
    </section>
  )
}

/** `null` veut dire illimité, et le DIT — une case vide se lit « zéro ». */
function Limit({ value, locale }: { value: number | null; locale: Locale }) {
  const { t } = useTranslation()
  return <>{value === null ? t('site.unlimited') : formatNumber(value, locale)}</>
}

/**
 * Le formulaire.
 *
 * Deux champs obligatoires. Le leurre `website` est masqué aux humains ET aux
 * lecteurs d'écran (`aria-hidden` + `tabIndex={-1}`) : un robot le remplit, un
 * utilisateur ne le rencontre jamais. C'est la protection anti-robot la moins chère,
 * et la seule qui n'impose rien — un CAPTCHA ferait fuir exactement le public visé.
 *
 * `method="post"` alors que React intercepte : c'est le comportement du jour où le
 * JavaScript ne s'exécute pas. En GET, le navigateur mettrait le nom et le numéro
 * dans l'URL, donc dans l'historique et dans les journaux (docs/DECISIONS.md §13.7).
 */
function DemoForm({ locale }: { locale: Locale }) {
  const { t } = useTranslation()
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const hydrated = useHydrated()

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const target = event.currentTarget
    setState('sending')

    try {
      await submitLead({
        data: {
          name: textField(form, 'name'),
          phone: textField(form, 'phone'),
          company: textField(form, 'company'),
          email: textField(form, 'email'),
          city: textField(form, 'city'),
          fleetSize: choiceField(form, 'fleetSize', FLEET_SIZES, '1-5'),
          message: textField(form, 'message'),
          locale,
          website: textField(form, 'website'),
        },
      })
      target.reset()
      setState('done')
    } catch {
      setState('error')
    }
  }

  return (
    <section id="demo" className="py-14 sm:py-20">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_28rem]">
        <div className="lg:self-center">
          <h2 className="text-xl font-semibold tracking-tight">{t('site.demoTitle')}</h2>
          <p className="mt-3 max-w-xl text-sm text-muted">{t('site.demoBody')}</p>
          <p className="mt-4 max-w-xl text-xs text-muted">{t('site.demoPrivacy')}</p>
        </div>

        <Card>
          <CardContent>
            <form method="post" onSubmit={(event) => void submit(event)} className="grid gap-4">
              <Field label={t('site.fieldName')} htmlFor="lead-name">
                <Input id="lead-name" name="name" required autoComplete="name" />
              </Field>

              <Field
                label={t('site.fieldPhone')}
                htmlFor="lead-phone"
                hint={t('site.fieldPhoneHint')}
              >
                <Input id="lead-phone" name="phone" type="tel" required autoComplete="tel" />
              </Field>

              <Field label={t('site.fieldCompany')} htmlFor="lead-company">
                <Input id="lead-company" name="company" autoComplete="organization" />
              </Field>

              <CityCombobox name="city" label={t('site.fieldCity')} />

              <Field label={t('site.fieldFleetSize')} htmlFor="lead-fleet">
                <Select id="lead-fleet" name="fleetSize" defaultValue="1-5">
                  {FLEET_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label={t('site.fieldEmail')} htmlFor="lead-email">
                <Input id="lead-email" name="email" type="email" autoComplete="email" />
              </Field>

              <Field label={t('site.fieldMessage')} htmlFor="lead-message">
                <Textarea id="lead-message" name="message" rows={3} />
              </Field>

              {/* Leurre. Invisible aux humains ET aux lecteurs d'écran. */}
              <div aria-hidden="true" className="hidden">
                <label>
                  Website
                  <input name="website" type="text" tabIndex={-1} autoComplete="off" />
                </label>
              </div>

              {/* Le bouton attend l'hydratation : avant elle, valider enverrait un
                  POST natif qui recharge la page sans rien enregistrer.
                  Voir src/ui/forms/use-hydrated.ts. */}
              <Button type="submit" className="w-full" disabled={!hydrated || state === 'sending'}>
                {state === 'sending' ? t('auth.working') : t('site.send')}
              </Button>

              {/* `status` et non `alert` : une confirmation s'annonce sans interrompre. */}
              {state === 'done' ? (
                <Alert role="status" variant="success">
                  {t('site.sent')}
                </Alert>
              ) : null}
              {state === 'error' ? (
                <Alert role="alert" variant="destructive">
                  {t('site.sendFailed')}
                </Alert>
              ) : null}
            </form>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}

import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
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
import { BUTTON_STYLE, Button, buttonClasses } from '~/ui/primitives/button'
import { Card, CardBody } from '~/ui/primitives/card'
import { DataTable } from '~/ui/primitives/table'
import { CityCombobox } from '~/ui/forms/city-combobox'
import { choiceField, textField } from '~/ui/forms/form-data'

/**
 * SITE VITRINE.
 *
 * La page disait « Socle en place » depuis la Phase 1 — un provisoire assumé, mais un
 * provisoire quand même : c'est la seule page que verra un loueur qui découvre le
 * produit, et elle lui parlait de jetons de design.
 *
 * Trois principes tenus ici, et le troisième est le seul qui compte vraiment :
 *
 *  1. **Les tarifs sont LUS EN BASE**, jamais écrits dans la page. Un prix codé dans
 *     le JSX finit toujours par contredire celui de la facture.
 *  2. **Rien n'est promis qui n'existe pas.** Chaque promesse de cette page
 *     correspond à un écran livré. Une vitrine qui vend la Phase 14 se paie au
 *     premier rendez-vous.
 *  3. **Le formulaire demande deux champs obligatoires**, un nom et un numéro. Chaque
 *     champ obligatoire de plus coûte des prospects, et un premier contact n'a pas
 *     besoin de connaître la taille de la flotte.
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
 * Volontairement SOBRE. La version précédente empilait une pastille colorée, un
 * titre de 40 px et deux boutons côte à côte : c'est la disposition qu'on obtient
 * par défaut, et c'est précisément ce qui fait « page générée ». Ici, une ligne de
 * contexte en petit, un titre de 28 px, une phrase, et UNE action principale — la
 * connexion est un lien, pas un second bouton qui se dispute l'attention
 * (`primary-action`).
 */
function Hero({ locale }: { locale: Locale }) {
  const { t } = useTranslation()

  return (
    <section className="border-b border-rule py-12 sm:py-14">
      <div className="max-w-2xl">
        <p className="text-xs font-medium text-stamp">{t('site.badge')}</p>
        <h1 className="mt-3 text-2xl font-semibold">{t('site.heroTitle')}</h1>
        <p className="mt-3 text-md text-muted">{t('site.heroBody')}</p>

        <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
          {/* Un lien reste un <a> : jamais de <button> imbriqué dans une ancre. */}
          <a href="#demo" className={buttonClasses('primary')} style={BUTTON_STYLE}>
            <span>{t('site.requestDemo')}</span>
          </a>
          <Link
            to="/$lang/connexion"
            params={{ lang: locale }}
            className="text-sm text-muted underline underline-offset-4 hover:text-ink"
          >
            {t('auth.signIn')}
          </Link>
        </div>

        <p className="mt-4 text-xs text-muted">{t('site.heroNote')}</p>
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
 * Une liste à deux colonnes séparée par des filets, PAS une grille de six cartes
 * identiques. La grille de cartes à icône est la mise en page la plus reconnaissable
 * des pages produites à la chaîne, et elle donne le même poids à six choses qui n'en
 * ont pas le même. Des filets suffisent à séparer.
 */
function Capabilities() {
  const { t } = useTranslation()

  return (
    <section className="border-b border-rule py-12 sm:py-14">
      <h2 className="text-lg font-semibold">{t('site.capabilitiesTitle')}</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted">{t('site.capabilitiesBody')}</p>

      <div className="mt-8 grid gap-x-10 sm:grid-cols-2">
        {CAPABILITIES.map((capability) => (
          <div key={capability.key} className="border-t border-rule py-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <span className="text-stamp">
                <capability.icon size={18} />
              </span>
              {t(`site.capability.${capability.key}.title`)}
            </h3>
            <p className="mt-1.5 text-sm text-muted">
              {t(`site.capability.${capability.key}.body`)}
            </p>
          </div>
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
 */
function MadeForMorocco() {
  const { t } = useTranslation()
  const points = ['plates', 'arabic', 'time', 'money'] as const

  return (
    <section className="border-b border-rule py-12 sm:py-14">
      <h2 className="text-lg font-semibold">{t('site.localTitle')}</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted">{t('site.localBody')}</p>

      <ul className="mt-8 grid gap-x-10 sm:grid-cols-2">
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
 * Un TABLEAU de comparaison, pas quatre cartes. Quatre cartes de prix côte à côte
 * obligent à faire l'aller-retour des yeux pour comparer une limite d'une offre à
 * l'autre ; une ligne par limite permet de lire « voitures » en travers. Sous 768 px,
 * le tableau redevient une fiche par offre — la même primitive que dans la console.
 */
function Pricing({ plans, locale }: { plans: readonly PublicPlan[]; locale: Locale }) {
  const { t } = useTranslation()

  return (
    <section className="border-b border-rule py-12 sm:py-14">
      <h2 className="text-lg font-semibold">{t('site.pricingTitle')}</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted">{t('site.pricingBody')}</p>

      <div className="mt-6">
        <Card as="div">
          <DataTable
            caption={t('site.pricingTitle')}
            rows={plans}
            rowKey={(plan) => plan.code}
            columns={[
              {
                key: 'plan',
                header: t('billing.plan'),
                cell: (plan) => (
                  <>
                    <span className="font-medium">{t(plan.nameKey)}</span>
                    {plan.trialDays > 0 ? (
                      <span className="block text-xs text-muted">
                        {t('site.trialDays', { days: plan.trialDays })}
                      </span>
                    ) : null}
                  </>
                ),
              },
              {
                key: 'price',
                header: t('billing.perMonth'),
                numeric: true,
                cell: (plan) =>
                  formatMoney(plan.monthlyCents, locale, plan.currency, { withDecimals: false }),
              },
              {
                key: 'vehicles',
                header: t('site.limitVehicles'),
                numeric: true,
                cell: (plan) => <Limit value={plan.maxVehicles} locale={locale} />,
              },
              {
                key: 'users',
                header: t('site.limitUsers'),
                numeric: true,
                cell: (plan) => <Limit value={plan.maxUsers} locale={locale} />,
              },
              {
                key: 'branches',
                header: t('site.limitBranches'),
                numeric: true,
                secondary: true,
                cell: (plan) => <Limit value={plan.maxBranches} locale={locale} />,
              },
            ]}
          />
        </Card>
      </div>

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
 * Deux champs obligatoires. Le leurre `website` est masqué aux humains et aux
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
    <section id="demo" className="py-12 sm:py-16">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_26rem]">
        <div>
          <h2 className="font-display text-xl font-semibold tracking-tight">
            {t('site.demoTitle')}
          </h2>
          <p className="mt-2 max-w-xl text-sm text-muted">{t('site.demoBody')}</p>
          <p className="mt-4 max-w-xl text-sm text-muted">{t('site.demoPrivacy')}</p>
        </div>

        <Card as="div" className="self-start">
          <CardBody>
            <form method="post" onSubmit={(event) => void submit(event)} className="grid gap-4">
              <LeadField name="name" label={t('site.fieldName')} required autoComplete="name" />
              <LeadField
                name="phone"
                label={t('site.fieldPhone')}
                type="tel"
                required
                autoComplete="tel"
                hint={t('site.fieldPhoneHint')}
              />
              <LeadField
                name="company"
                label={t('site.fieldCompany')}
                autoComplete="organization"
              />
              <CityCombobox name="city" label={t('site.fieldCity')} />
              <label className="block">
                <span className="text-xs text-muted">{t('site.fieldFleetSize')}</span>
                <select
                  name="fleetSize"
                  defaultValue="1-5"
                  className={INPUT_CLASS}
                  style={BUTTON_STYLE}
                >
                  {FLEET_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
              <LeadField
                name="email"
                label={t('site.fieldEmail')}
                type="email"
                autoComplete="email"
              />
              <label className="block">
                <span className="text-xs text-muted">{t('site.fieldMessage')}</span>
                <textarea name="message" rows={3} className={INPUT_CLASS} />
              </label>

              {/* Leurre. Invisible aux humains ET aux lecteurs d'écran. */}
              <div aria-hidden="true" className="hidden">
                <label>
                  Website
                  <input name="website" type="text" tabIndex={-1} autoComplete="off" />
                </label>
              </div>

              <Button
                type="submit"
                variant="primary"
                className="w-full"
                disabled={state === 'sending'}
              >
                {state === 'sending' ? t('auth.working') : t('site.send')}
              </Button>

              {state === 'done' ? (
                <p role="status" className="text-sm text-calm">
                  {t('site.sent')}
                </p>
              ) : null}
              {state === 'error' ? (
                <p role="alert" className="text-sm text-danger">
                  {t('site.sendFailed')}
                </p>
              ) : null}
            </form>
          </CardBody>
        </Card>
      </div>
    </section>
  )
}

/** Même géométrie que les champs partagés (`src/ui/forms/fields.tsx`). */
const INPUT_CLASS =
  'mt-1 block w-full rounded-sm border border-rule-strong bg-surface px-3 py-2 text-base transition-colors focus:border-stamp'

function LeadField({
  name,
  label,
  type = 'text',
  required,
  autoComplete,
  hint,
}: {
  name: string
  label: string
  type?: string
  required?: boolean
  autoComplete?: string
  hint?: string
}) {
  return (
    <label className="block">
      <span className="text-xs text-muted">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        className={INPUT_CLASS}
        style={BUTTON_STYLE}
      />
      {hint ? <span className="mt-1 block text-2xs text-muted">{hint}</span> : null}
    </label>
  )
}

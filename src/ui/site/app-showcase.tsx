import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { formatMoney, formatNumber } from '~/i18n/format'
import type { Locale } from '~/i18n/locales'
import { Plate } from '~/ui/primitives/plate'
import { Badge, type BadgeVariant } from '~/ui/shadcn/badge'
import { cn } from '~/ui/shadcn/utils'
import { Reveal } from './reveal'

/**
 * DEUX ÉCRANS DU PRODUIT.
 *
 * **Ce sont des répliques VIVANTES, pas des captures.** Le choix mérite d'être écrit,
 * parce qu'il se défend et qu'il a une date de péremption.
 *
 * Une capture PNG serait plus honnête sur un point — elle montre ce qui existe
 * vraiment — et pire sur quatre :
 *
 *  1. elle ne suit pas le THÈME. Une capture claire posée sur une page sombre est une
 *     tache blanche, et il en faudrait deux jeux ;
 *  2. elle ne suit pas la LANGUE. Trois langues, deux écrans, deux thèmes : douze
 *     fichiers à regénérer à chaque retouche d'interface, donc douze fichiers périmés ;
 *  3. elle ne suit pas le SENS DE LECTURE. En arabe, l'interface se retourne — pas
 *     l'image ;
 *  4. elle pèse. Ces répliques utilisent les jetons, les polices et les composants
 *     déjà chargés : elles ne coûtent pas un octet de réseau et restent nettes sur un
 *     écran à trois fois la densité.
 *
 * Ce qu'elles montrent est FIDÈLE : mêmes jetons de couleur, mêmes rayons, mêmes
 * cachets de sévérité, mêmes plaques isolées en bidi que les écrans réels. Ce sont les
 * DONNÉES qui sont inventées, et c'est le seul mensonge assumé de cette page — le même
 * que celui de n'importe quelle capture d'écran de démonstration.
 *
 * **Pour passer à de vraies captures**, il suffit de remplacer le contenu de
 * `<DeviceFigure>` par une `<img>` : le cadre, la légende et l'animation ne bougent
 * pas. C'est une décision de contenu, pas de structure.
 *
 * L'appareil est un TÉLÉPHONE, et pas un navigateur de bureau : l'écran principal du
 * produit est un téléphone posé sur un comptoir. Montrer une fenêtre de bureau
 * vendrait autre chose que ce qui est livré.
 */

export function AppShowcase({ locale }: { locale: Locale }) {
  const { t } = useTranslation()

  return (
    <Reveal as="section" className="border-b border-border py-14 sm:py-16">
      <h2 className="text-lg font-semibold tracking-tight">{t('site.showcase.title')}</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t('site.showcase.body')}</p>

      <div className="mt-10 grid gap-10 sm:grid-cols-2 sm:gap-6">
        <Reveal index={0}>
          <DeviceFigure caption={t('site.showcase.dashboardCaption')}>
            <DashboardScreen locale={locale} />
          </DeviceFigure>
        </Reveal>

        <Reveal index={1}>
          <DeviceFigure caption={t('site.showcase.fleetCaption')}>
            <FleetScreen locale={locale} />
          </DeviceFigure>
        </Reveal>
      </div>
    </Reveal>
  )
}

/**
 * Le cadre.
 *
 * L'écran est `aria-hidden` et la LÉGENDE porte le sens. Un lecteur d'écran qui
 * traverserait la réplique annoncerait « Retards, 2, Assurance, expiré » — des données
 * inventées, présentées comme réelles, au milieu d'une page de vente. La légende dit
 * ce que l'image montre, ce qui est exactement le travail d'une légende.
 */
function DeviceFigure({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <figure className="grid gap-3">
      <div
        aria-hidden="true"
        className="mx-auto w-full max-w-[19rem] rounded-[2.25rem] border border-border bg-muted p-2.5 shadow-card"
      >
        {/* L'encoche : deux traits, la barre d'état résumée. Rien de plus — un
            dessin d'appareil trop détaillé attire l'œil sur le cadre, pas sur l'écran. */}
        <div className="mx-auto mb-2 h-1 w-16 rounded-full bg-border" />

        <div className="overflow-hidden rounded-[1.6rem] border border-border bg-background">
          {children}
        </div>
      </div>

      <figcaption className="text-center text-xs text-muted-foreground sm:text-start">
        {caption}
      </figcaption>
    </figure>
  )
}

/** L'en-tête d'écran, commun aux deux répliques. */
function ScreenHeader({ title }: { title: string }) {
  return (
    <div className="border-b border-border bg-card px-3 py-2.5">
      <p className="text-xs font-semibold tracking-tight">{title}</p>
    </div>
  )
}

/**
 * ÉCRAN 1 — le tableau de bord.
 *
 * Quatre tuiles et trois échéances : c'est ce qu'on regarde le matin en ouvrant
 * l'agence, et c'est la promesse de l'accroche. Les nombres passent par
 * `formatNumber` / `formatMoney` comme partout ailleurs — un chiffre écrit en dur ici
 * s'afficherait avec les séparateurs français dans une page arabe.
 */
function DashboardScreen({ locale }: { locale: Locale }) {
  const { t } = useTranslation()

  /*
   * Le type est POSÉ sur le tableau, pas déduit de son contenu.
   *
   * Déduit, TypeScript compose une union de deux formes d'objet — celles qui portent
   * `tone` et celles qui ne le portent pas — et `tile.tone` cesse d'être lisible sur
   * l'union. Un `tone?:` déclaré une fois vaut mieux qu'un `as const` sur chaque ligne.
   */
  const tiles: ReadonlyArray<{ label: string; value: string; tone?: 'danger' }> = [
    { label: t('home.tileOut'), value: formatNumber(7, locale) },
    { label: t('home.tileDueToday'), value: formatNumber(3, locale) },
    { label: t('home.tileLate'), value: formatNumber(1, locale), tone: 'danger' },
    {
      label: t('home.tileCollected'),
      value: formatMoney(4_820_000, locale, 'MAD', { withDecimals: false }),
    },
  ]

  const deadlines: ReadonlyArray<{ label: string; when: string; tone: BadgeVariant }> = [
    { label: t('deadline.insurance'), when: t('deadline.expired'), tone: 'danger' },
    { label: t('deadline.inspection'), when: t('deadline.inDays', { count: 6 }), tone: 'warn' },
    { label: t('deadline.oilChange'), when: t('deadline.inDays', { count: 21 }), tone: 'neutral' },
  ]

  return (
    <div className="grid gap-3 pb-3">
      <ScreenHeader title={t('nav.dashboard')} />

      <div className="grid grid-cols-2 gap-2 px-3">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-lg border border-border bg-card px-2.5 py-2">
            <p className="text-2xs leading-tight text-muted-foreground">{tile.label}</p>
            <p
              className={cn(
                'numeric mt-1 text-sm font-semibold',
                tile.tone === 'danger' && 'text-destructive',
              )}
            >
              {tile.value}
            </p>
          </div>
        ))}
      </div>

      <div className="px-3">
        <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
          {t('home.nextDeadlines')}
        </p>

        <ul className="mt-1.5 grid gap-1.5">
          {deadlines.map((deadline) => (
            <li
              key={deadline.label}
              className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-2.5 py-2"
            >
              <span className="text-2xs font-medium">{deadline.label}</span>
              <Badge variant={deadline.tone}>{deadline.when}</Badge>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/**
 * Les voitures de la réplique.
 *
 * Des DONNÉES, pas du texte d'interface : une plaque et un modèle ne se traduisent
 * pas. Les plaques passent par `<Plate>`, donc par l'isolation bidi — c'est justement
 * le détail que la section « Fait pour le Maroc » revendique deux blocs plus haut, et
 * il serait fâcheux que la démonstration le rate.
 */
const FLEET_ROWS: ReadonlyArray<{
  plate: string
  model: string
  statusKey: string
  tone: BadgeVariant
}> = [
  { plate: '48219 أ 6', model: 'Dacia Logan', statusKey: 'contract.statuses.active', tone: 'accent' },
  { plate: '13074 ب 1', model: 'Renault Clio', statusKey: 'contract.statuses.late', tone: 'danger' },
  { plate: '90562 و 20', model: 'Hyundai Accent', statusKey: 'contract.statuses.returned', tone: 'calm' },
  {
    plate: '27431 د 10',
    model: 'Peugeot 208',
    statusKey: 'contract.statuses.reservation',
    tone: 'neutral',
  },
]

/**
 * ÉCRAN 2 — la flotte.
 *
 * Choisi contre la carte GPS, qui est pourtant plus spectaculaire : la carte se vend
 * mal en image fixe — sans mouvement, c'est un fond gris avec des points. La liste des
 * voitures, elle, montre en un coup d'œil les plaques marocaines et l'état de chaque
 * location, c'est-à-dire les deux choses qu'un loueur cherche à vérifier.
 */
function FleetScreen({ locale }: { locale: Locale }) {
  const { t } = useTranslation()

  return (
    <div className="grid gap-3 pb-3">
      <ScreenHeader title={t('nav.vehicles')} />

      <p className="px-3 text-2xs text-muted-foreground">
        {t('home.fleetCount', { count: 12 })}
      </p>

      <ul className="grid gap-1.5 px-3">
        {FLEET_ROWS.map((row) => (
          <li
            key={row.plate}
            className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-2.5 py-2"
          >
            <span className="grid gap-0.5">
              <Plate value={row.plate} size="sm" />
              <span className="text-2xs text-muted-foreground">{row.model}</span>
            </span>
            <Badge variant={row.tone}>{t(row.statusKey)}</Badge>
          </li>
        ))}
      </ul>

      <p className="numeric px-3 text-2xs text-muted-foreground">
        {t('vehicle.dailyRate')} {formatMoney(28_000, locale, 'MAD', { withDecimals: false })}
      </p>
    </div>
  )
}

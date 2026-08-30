import { createFileRoute, Link, type SearchSchemaInput } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { VEHICLE_STATUSES } from '~/core/schemas/vehicle'
import { formatDate, formatKilometers, formatMoney, formatNumber } from '~/i18n/format'
import { DEFAULT_LOCALE, isLocale, type Locale } from '~/i18n/locales'
import { listVehicles, type VehicleListRow } from '~/server/vehicles'
import { buttonVariants } from '~/ui/shadcn/button'
import { EmptyState } from '~/ui/feedback/states'
import { ChevronEndIcon } from '~/ui/icons'
import { Plate } from '~/ui/primitives/plate'
import { Badge, type BadgeVariant } from '~/ui/shadcn/badge'
import { cn } from '~/ui/shadcn/utils'
import { VehicleTableSkeleton } from '~/ui/skeletons'

/**
 * Liste des véhicules — un registre, pas un tableau.
 *
 * Marge de plaque en `inline-start`, filets, aucune ombre. La ligne se lit de gauche
 * à droite comme une ligne de registre : identifiant, objet, état, compteur.
 */

/**
 * LES ÉTATS, ET « TOUTES » EN TÊTE.
 *
 * L'ordre est celui du comptoir, pas celui de l'énumération : on regarde d'abord ce
 * qui est dehors et ce qui est libre. `sold` ferme la marche — une voiture vendue
 * n'appartient plus à la flotte, elle n'est là que pour l'historique.
 */
const ALL = 'tous'
const FILTERS = [ALL, ...VEHICLE_STATUSES] as const
type VehicleFilter = (typeof FILTERS)[number]

/**
 * Le filtre vit dans l'URL, pas dans un `useState`.
 *
 * Trois conséquences, et les trois comptent au comptoir : « montre-moi les voitures
 * dehors » s'envoie par message, le bouton RETOUR du navigateur ramène à la vue
 * précédente, et rouvrir l'onglet retrouve le même écran (`deep-linking`).
 *
 * `.catch(ALL)` plutôt qu'une erreur : une URL trafiquée ou un ancien signet affiche
 * la flotte entière. Un écran de liste ne doit jamais répondre par une page d'erreur
 * à cause d'un paramètre — il montre tout, ce qui est le pire cas acceptable.
 *
 * La CLÉ est française comme le chemin qui la porte (`/vehicules`), les VALEURS
 * restent celles du domaine (`rented`, `out_of_service`) : les traduire demanderait
 * une table de passage, qui finirait par diverger de l'énumération.
 */
const VehicleSearch = z.object({
  etat: z.enum(FILTERS).catch(ALL).default(ALL),
})

/**
 * `SearchSchemaInput` sépare ce qu'on ÉCRIT de ce qu'on LIT.
 *
 * Sans lui, déclarer `etat` rendait le paramètre OBLIGATOIRE sur chaque
 * `<Link to="/$lang/app/vehicules">` du produit — quatre écrans sans rapport se
 * mettaient à devoir répéter `search={{ etat: 'tous' }}` pour un filtre qui ne les
 * regarde pas. Le marqueur dit au routeur que l'entrée est facultative ; la sortie,
 * elle, reste garantie par `.default()`, donc `useSearch()` ne rend jamais `undefined`.
 */
type VehicleSearchInput = { etat?: VehicleFilter } & SearchSchemaInput

export const Route = createFileRoute('/$lang/app/vehicules/')({
  validateSearch: (search: VehicleSearchInput) => VehicleSearch.parse(search),
  loader: async () => ({ vehicles: await listVehicles() }),
  pendingComponent: VehicleTableSkeleton,
  component: VehiclesPage,
})

const STATUS_TONES: Record<string, BadgeVariant> = {
  available: 'calm',
  rented: 'accent',
  maintenance: 'warn',
  out_of_service: 'danger',
  sold: 'neutral',
}

/** Sévérité → cachet. La couleur double le libellé, elle ne le remplace pas. */
const SEVERITY_TONES: Record<string, BadgeVariant> = {
  blocking: 'danger',
  critical: 'danger',
  high: 'warn',
  medium: 'neutral',
  low: 'neutral',
}

function VehiclesPage() {
  const { t } = useTranslation()
  const { vehicles } = Route.useLoaderData()
  const { lang } = Route.useParams()
  const { etat } = Route.useSearch()
  const locale = isLocale(lang) ? lang : DEFAULT_LOCALE

  /*
   * Le tri se fait ICI, sur la liste déjà chargée, et non par une requête par état.
   *
   * Le chargeur ramène la flotte entière — c'est ce qu'il faisait déjà, et les quotas
   * la plafonnent à quelques dizaines de voitures. Filtrer en mémoire rend le
   * changement d'onglet INSTANTANÉ, sans aller-retour réseau ni écran d'attente, et
   * permet d'afficher le compte de chaque état sans les compter en base.
   *
   * Le jour où une agence dépasse le millier de voitures, c'est le chargeur qu'il
   * faudra paginer — pas cette ligne.
   */
  const shown = etat === ALL ? vehicles : vehicles.filter((vehicle) => vehicle.status === etat)

  const counts = new Map<VehicleFilter, number>([[ALL, vehicles.length]])
  for (const vehicle of vehicles) {
    const key = vehicle.status as VehicleFilter
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return (
    <div>
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-2 border-b-2 border-input pb-3">
        <h1 className="text-2xl">{t('vehicle.list.title')}</h1>
        <span className="numeric text-xs text-muted-foreground">
          {t('vehicle.list.count', { count: shown.length })}
        </span>
        <span className="ms-auto">
          <Link
            to="/$lang/app/vehicules/nouveau"
            params={{ lang: locale }}
            className={buttonVariants()}
          >
            <span>{t('vehicle.list.add')}</span>
          </Link>
        </span>
      </header>

      {/* La flotte vide n'a pas d'états à filtrer : on n'affiche pas six onglets à zéro. */}
      {vehicles.length > 0 ? (
        <StatusFilters current={etat} counts={counts} locale={locale} />
      ) : null}

      {vehicles.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title={t('vehicle.list.empty')}
            body={t('vehicle.list.emptyBody')}
            action={
              <Link
                to="/$lang/app/vehicules/nouveau"
                params={{ lang: locale }}
                className={buttonVariants()}
              >
                <span>{t('vehicle.list.add')}</span>
              </Link>
            }
          />
        </div>
      ) : shown.length === 0 ? (
        /*
          Filtre vide : le vide est un RÉSULTAT, pas une flotte absente. Le message le
          dit, et la sortie est une action — pas au visiteur de deviner qu'il doit
          retoucher l'URL.
        */
        <div className="mt-8">
          <EmptyState
            title={t('vehicle.list.emptyFiltered')}
            body={t('vehicle.list.emptyFilteredBody')}
            action={
              <Link
                to="/$lang/app/vehicules"
                params={{ lang: locale }}
                search={{ etat: ALL }}
                className={buttonVariants({ variant: 'outline' })}
              >
                <span>{t('vehicle.list.showAll')}</span>
              </Link>
            }
          />
        </div>
      ) : (
        <ul className="mt-6 border-t border-border">
          {shown.map((vehicle) => (
            <VehicleRow key={vehicle.id} vehicle={vehicle} locale={locale} />
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * LES ONGLETS D'ÉTAT — des LIENS, pas des boutons.
 *
 * Chaque état est une adresse : elle se partage, se met en signet, et le bouton retour
 * du navigateur la traverse comme n'importe quelle page. Des `<button>` pilotant un
 * `useState` auraient produit le même écran et rien de tout cela.
 *
 * La bande DÉFILE horizontalement sous `lg` (`.nav-strip`, la même que la navigation
 * du téléphone) : six onglets ne tiennent pas sur 375 px. Elle déborde exprès de la
 * gouttière pour que le défilement commence au bord de l'écran.
 *
 * L'onglet actif porte `aria-current="page"` ET un contraste de fond : la couleur ne
 * dit jamais l'information seule (`color-not-only`). Le compte vit dans l'onglet —
 * « combien de voitures sont dehors » est la question qu'on se pose en l'ouvrant, et
 * il serait absurde d'avoir à cliquer pour y répondre.
 */
function StatusFilters({
  current,
  counts,
  locale,
}: {
  current: VehicleFilter
  counts: ReadonlyMap<VehicleFilter, number>
  locale: Locale
}) {
  const { t } = useTranslation()

  return (
    <nav
      aria-label={t('vehicle.list.filterLabel')}
      className="nav-strip -ms-4 mt-6 flex gap-2 ps-4 sm:-ms-6 sm:ps-6 lg:ms-0 lg:ps-0"
    >
      {FILTERS.map((filter) => {
        const active = filter === current
        return (
          <Link
            key={filter}
            to="/$lang/app/vehicules"
            params={{ lang: locale }}
            search={{ etat: filter }}
            aria-current={active ? 'page' : undefined}
            style={{ minHeight: 'var(--tap-target)' }}
            className={cn(
              'flex items-center gap-2 rounded-md border px-3 text-sm transition-colors',
              active
                ? 'border-ring bg-accent font-medium text-accent-foreground'
                : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <span>{filter === ALL ? t('vehicle.list.all') : t(`vehicle.status.${filter}`)}</span>
            <span className="numeric text-2xs text-muted-foreground">
              {formatNumber(counts.get(filter) ?? 0, locale)}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}

function VehicleRow({
  vehicle,
  locale,
}: {
  vehicle: VehicleListRow
  locale: Locale
}) {
  const { t } = useTranslation()

  return (
    <li className="border-b border-border">
      <Link
        to="/$lang/app/vehicules/$vehicleId"
        params={{ lang: locale, vehicleId: vehicle.id }}
        className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-muted"
        /* `--row-height-comfy` (52 px) et non `dense` : sur téléphone, une ligne de
           liste est une CIBLE, pas une rangée de tableau. */
        style={{ minHeight: 'var(--row-height-comfy)' }}
      >
        {/*
          LA VIGNETTE, avant la plaque, et seulement si elle existe.

          Pas de cadre gris à la place quand il n'y en a pas : une colonne de rectangles
          vides sur quarante lignes coûte plus d'attention qu'elle n'en rend, et la
          plaque suffit à identifier une voiture — c'est son rôle. La photo n'est là que
          pour les agences qui l'ont posée, et pour la reconnaissance à l'œil qu'elle
          permet alors : « la Dacia blanche », qu'on retrouve plus vite qu'un numéro.

          `loading="lazy"` parce qu'une flotte de quarante lignes tient sur trois écrans
          et que les trente premières images ne servent à personne au chargement.
        */}
        {vehicle.photoPath === null ? null : (
          <img
            src={`/api/fichiers/${vehicle.photoPath}`}
            alt=""
            loading="lazy"
            className="hidden size-9 shrink-0 rounded-md object-cover sm:block"
          />
        )}

        {/* La marge de registre porte l'identifiant : ici la plaque. */}
        <span className="ledger-margin w-24 sm:w-32 shrink-0 pe-4">
          <Plate value={vehicle.plate} />
        </span>

        <span className="font-medium">
          {vehicle.make} {vehicle.model}
        </span>
        {/* L'année et le prix se replient sur téléphone : ce qu'on cherche dans une
            liste au pouce, c'est la plaque, le modèle, l'état et l'échéance. Le reste
            est à un tap de distance sur la fiche. */}
        {vehicle.year ? (
          <span className="numeric hidden text-xs text-muted-foreground sm:inline">{vehicle.year}</span>
        ) : null}

        <span className="ms-auto flex flex-wrap items-center gap-x-4 gap-y-1">
          {/*
            La prochaine échéance, en bout de ligne.

            Elle vient d'une agrégation unique sur `alerts` (voir `readVehicleList`) et
            non d'une requête par ligne. Elle porte son LIBELLÉ, pas seulement une
            couleur : « Assurance » se lit sans savoir ce qu'un cachet orange signifie,
            et un daltonien lit la même chose que les autres.
          */}
          {vehicle.nextDeadline ? (
            <span className="flex items-center gap-2">
              <Badge variant={SEVERITY_TONES[vehicle.nextDeadline.severity] ?? 'neutral'}>
                {t(`alerts.type.${vehicle.nextDeadline.alertType}`)}
              </Badge>
              {vehicle.nextDeadline.dueOn ? (
                <span className="numeric hidden text-2xs text-muted-foreground sm:inline">
                  {formatDate(vehicle.nextDeadline.dueOn, locale)}
                </span>
              ) : null}
            </span>
          ) : null}

          <Badge variant={STATUS_TONES[vehicle.status] ?? 'neutral'}>
            {t(`vehicle.status.${vehicle.status}`)}
          </Badge>
          <span className="numeric text-xs text-muted-foreground">
            {formatKilometers(vehicle.currentKm, locale)} km
          </span>
          {vehicle.dailyCents !== null ? (
            <span className="numeric hidden text-xs text-muted-foreground sm:inline">
              {formatMoney(vehicle.dailyCents, locale, 'MAD', { withDecimals: false })}
            </span>
          ) : null}
          <ChevronEndIcon size={16} className="text-muted-foreground" />
        </span>
      </Link>
    </li>
  )
}

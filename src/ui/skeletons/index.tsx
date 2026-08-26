import { useTranslation } from 'react-i18next'

import { Skeleton, SkeletonRegion } from '~/ui/feedback/skeleton'

/**
 * Les six squelettes du cahier des charges §14.
 *
 * Ils sont calibrés sur les jetons de géométrie (`--row-height-dense`, marge de
 * registre, filets) et non sur des valeurs devinées. Chacun sera revérifié contre
 * son écran réel dans la phase qui le livre — la vérification consiste à basculer
 * l'écran entre squelette et contenu et à constater qu'aucun élément ne saute.
 */

function LedgerRow({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex items-center gap-4 border-b border-rule px-4"
      style={{ height: 'var(--row-height-dense)' }}
    >
      {children}
    </div>
  )
}

/** Tableau des véhicules : marge de plaque, modèle, statut, kilométrage, alerte. */
export function VehicleTableSkeleton({ rows = 8 }: { rows?: number }) {
  const { t } = useTranslation()

  return (
    <SkeletonRegion label={t('loading.vehicles')}>
      <div className="border-t border-rule">
        {Array.from({ length: rows }, (_, index) => (
          <LedgerRow key={index}>
            <span className="ledger-margin w-24 shrink-0 pe-4">
              <Skeleton width="4.5rem" height="0.85rem" />
            </span>
            <Skeleton width="10rem" height="0.85rem" />
            <span className="ms-auto flex items-center gap-4">
              {/* Échéance : cachet + date, la colonne ajoutée en Phase 8. */}
              <Skeleton width="5rem" height="0.85rem" />
              <Skeleton width="4rem" height="0.85rem" />
              <Skeleton width="4.5rem" height="0.85rem" />
              <Skeleton width="5rem" height="0.85rem" />
              <Skeleton width="1.25rem" height="1.25rem" />
            </span>
          </LedgerRow>
        ))}
      </div>
    </SkeletonRegion>
  )
}

/** Tableau de bord : bandeau d'échéances + quatre compteurs + une liste courte. */
export function DashboardSkeleton() {
  const { t } = useTranslation()

  return (
    <SkeletonRegion label={t('loading.dashboard')}>
      <div className="border-y-2 border-rule-strong px-4 py-3">
        <Skeleton width="18rem" height="1rem" />
      </div>
      <div className="grid grid-cols-2 gap-px bg-rule sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="bg-paper p-4">
            <Skeleton width="5rem" height="0.75rem" />
            <span className="mt-3 block">
              <Skeleton width="3.5rem" height="1.75rem" />
            </span>
          </div>
        ))}
      </div>
      <div className="mt-6 border-t border-rule">
        {Array.from({ length: 5 }, (_, index) => (
          <LedgerRow key={index}>
            <Skeleton width="1.25rem" height="1.25rem" />
            <Skeleton width="14rem" height="0.85rem" />
            <span className="ms-auto">
              <Skeleton width="5rem" height="0.85rem" />
            </span>
          </LedgerRow>
        ))}
      </div>
    </SkeletonRegion>
  )
}

/** Fiche véhicule : en-tête d'identité, ligne de relevé, puis la frise du carnet. */
export function VehicleFileSkeleton() {
  const { t } = useTranslation()

  return (
    <SkeletonRegion label={t('loading.vehicleFile')}>
      <div className="flex items-baseline gap-4 pb-3">
        <Skeleton width="6.5rem" height="1.5rem" />
        <Skeleton width="12rem" height="1.25rem" />
        <span className="ms-auto">
          <Skeleton width="5rem" height="1.5rem" />
        </span>
      </div>
      <div className="border-y border-rule py-3">
        <Skeleton width="20rem" height="0.85rem" />
      </div>
      <div className="mt-6 ps-8">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="relative py-4">
            <span
              className="absolute top-0 bottom-0 border-s border-rule"
              style={{ insetInlineStart: '-1.25rem' }}
            />
            <div className="flex items-center gap-4">
              <Skeleton width="5.5rem" height="0.85rem" />
              <Skeleton width="9rem" height="0.85rem" />
              <span className="ms-auto">
                <Skeleton width="4.5rem" height="0.85rem" />
              </span>
            </div>
          </div>
        ))}
      </div>
    </SkeletonRegion>
  )
}

/** Liste d'alertes : pastille de sévérité, intitulé, échéance, action. */
export function AlertListSkeleton({ rows = 6 }: { rows?: number }) {
  const { t } = useTranslation()

  return (
    <SkeletonRegion label={t('loading.alerts')}>
      <div className="border-t border-rule">
        {Array.from({ length: rows }, (_, index) => (
          <LedgerRow key={index}>
            <Skeleton width="0.25rem" height="1.5rem" />
            <Skeleton width="1.25rem" height="1.25rem" />
            <Skeleton width="13rem" height="0.85rem" />
            <span className="ms-auto flex items-center gap-4">
              <Skeleton width="6rem" height="0.85rem" />
              <Skeleton width="4rem" height="0.85rem" />
            </span>
          </LedgerRow>
        ))}
      </div>
    </SkeletonRegion>
  )
}

/** Carte GPS : la carte occupe tout, les contrôles sont en superposition. */
export function MapSkeleton() {
  const { t } = useTranslation()

  return (
    <SkeletonRegion label={t('loading.map')}>
      <div className="relative">
        <Skeleton height="min(70vh, 32rem)" />
        <div className="absolute top-3 start-3 flex flex-col gap-2">
          <Skeleton width="11rem" height="2.25rem" />
          <Skeleton width="7rem" height="2.25rem" />
        </div>
      </div>
    </SkeletonRegion>
  )
}

/** Abonnement : quelques lignes de définition, la consommation, les factures. */
export function BillingSkeleton() {
  const { t } = useTranslation()

  return (
    <SkeletonRegion label={t('loading.billing')}>
      <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="flex items-baseline gap-3 border-b border-rule pb-2">
            <Skeleton width="5rem" height="0.75rem" />
            <span className="ms-auto">
              <Skeleton width="7rem" height="0.85rem" />
            </span>
          </div>
        ))}
      </div>
      <div className="mt-10 border-t border-rule">
        {Array.from({ length: 3 }, (_, index) => (
          <LedgerRow key={index}>
            <Skeleton width="6rem" height="0.85rem" />
            <span className="ms-auto">
              <Skeleton width="5rem" height="0.85rem" />
            </span>
          </LedgerRow>
        ))}
      </div>
    </SkeletonRegion>
  )
}

/** Réglages : deux colonnes de champs, puis deux petits blocs. */
export function SettingsSkeleton() {
  const { t } = useTranslation()

  return (
    <SkeletonRegion label={t('loading.settings')}>
      <div className="grid gap-5 sm:grid-cols-2">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index}>
            <Skeleton width="6rem" height="0.75rem" />
            <span className="mt-1 block">
              <Skeleton height="2.75rem" />
            </span>
          </div>
        ))}
      </div>
      <div className="mt-10 flex items-center gap-4">
        <Skeleton width="5rem" height="0.9rem" />
        <Skeleton width="4rem" height="1.4rem" />
      </div>
    </SkeletonRegion>
  )
}

/** Tableau des organisations de /admin : le plus nu du produit. */
export function AdminOrganizationsSkeleton({ rows = 10 }: { rows?: number }) {
  const { t } = useTranslation()

  return (
    <SkeletonRegion label={t('loading.organizations')}>
      <div className="border-t border-rule">
        {Array.from({ length: rows }, (_, index) => (
          <LedgerRow key={index}>
            <span className="ledger-margin w-12 shrink-0 pe-4">
              <Skeleton width="1.75rem" height="0.8rem" />
            </span>
            <Skeleton width="11rem" height="0.85rem" />
            <span className="ms-auto flex items-center gap-6">
              <Skeleton width="4rem" height="0.8rem" />
              <Skeleton width="5rem" height="0.8rem" />
              <Skeleton width="6rem" height="0.8rem" />
            </span>
          </LedgerRow>
        ))}
      </div>
    </SkeletonRegion>
  )
}

/**
 * Tableau de bord de plateforme.
 *
 * Le squelette reproduit la GÉOMÉTRIE exacte de l'écran : quatre tuiles, puis deux
 * colonnes. C'est tout l'intérêt — un squelette qui ne tombe pas en face du contenu
 * fait sauter la page au moment où les données arrivent, ce qui est pire que rien.
 */
export function AdminDashboardSkeleton() {
  const { t } = useTranslation()

  return (
    <SkeletonRegion label={t('loading.organizations')}>
      <div className="mb-6">
        <Skeleton width="14rem" height="1.4rem" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="rounded-md border border-rule bg-surface px-4 py-3">
            <Skeleton width="6rem" height="0.7rem" />
            <div className="mt-2">
              <Skeleton width="4.5rem" height="1.3rem" />
            </div>
            <div className="mt-2">
              <Skeleton width="8rem" height="0.7rem" />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="rounded-md border border-rule bg-surface">
          <div className="border-b border-rule px-4 py-3 sm:px-5">
            <Skeleton width="9rem" height="0.9rem" />
          </div>
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="border-b border-rule px-4 py-3 last:border-b-0 sm:px-5">
              <Skeleton width="10rem" height="0.85rem" />
              <div className="mt-1">
                <Skeleton width="13rem" height="0.7rem" />
              </div>
            </div>
          ))}
        </div>

        <div className="grid gap-6 self-start">
          {Array.from({ length: 2 }, (_, index) => (
            <div key={index} className="rounded-md border border-rule bg-surface">
              <div className="border-b border-rule px-4 py-3 sm:px-5">
                <Skeleton width="7rem" height="0.9rem" />
              </div>
              <div className="space-y-3 px-4 py-4 sm:px-5">
                <Skeleton width="100%" height="0.8rem" />
                <Skeleton width="80%" height="0.8rem" />
                <Skeleton width="60%" height="0.8rem" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </SkeletonRegion>
  )
}

/**
 * Tableau de bord de l'agence : quatre tuiles, puis deux colonnes.
 *
 * Comme celui de la plateforme, il reproduit la géométrie exacte de l'écran. Un
 * squelette qui ne tombe pas en face du contenu fait sauter la page au moment où les
 * données arrivent — c'est pire que pas de squelette du tout.
 */
export function AgencyDashboardSkeleton() {
  const { t } = useTranslation()

  return (
    <SkeletonRegion label={t('loading.dashboard')}>
      <div className="mb-6">
        <Skeleton width="12rem" height="1.4rem" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="rounded-md border border-rule bg-surface px-4 py-3">
            <Skeleton width="6rem" height="0.7rem" />
            <div className="mt-2">
              <Skeleton width="3.5rem" height="1.3rem" />
            </div>
            <div className="mt-2">
              <Skeleton width="7rem" height="0.7rem" />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="rounded-md border border-rule bg-surface">
          <div className="border-b border-rule px-4 py-3 sm:px-5">
            <Skeleton width="9rem" height="0.9rem" />
          </div>
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="border-b border-rule px-4 py-3 last:border-b-0 sm:px-5">
              <Skeleton width="11rem" height="0.85rem" />
            </div>
          ))}
        </div>

        <div className="self-start rounded-md border border-rule bg-surface">
          <div className="border-b border-rule px-4 py-3 sm:px-5">
            <Skeleton width="5rem" height="0.9rem" />
          </div>
          <div className="space-y-4 px-4 py-4 sm:px-5">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index}>
                <Skeleton width="100%" height="0.8rem" />
                <div className="mt-1">
                  <Skeleton width="100%" height="0.4rem" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </SkeletonRegion>
  )
}

/** Prospects : une ligne par demande, deux niveaux de texte comme à l'écran. */
export function AdminLeadsSkeleton({ rows = 8 }: { rows?: number }) {
  const { t } = useTranslation()

  return (
    <SkeletonRegion label={t('loading.leads')}>
      <div className="mb-6">
        <Skeleton width="10rem" height="1.4rem" />
      </div>

      <div className="rounded-md border border-rule bg-surface">
        <div className="border-b border-rule px-4 py-3 sm:px-5">
          <Skeleton width="8rem" height="0.9rem" />
        </div>
        {Array.from({ length: rows }, (_, index) => (
          <div
            key={index}
            className="flex flex-wrap items-center gap-3 border-b border-rule px-4 py-3 last:border-b-0 sm:px-5"
          >
            <span className="flex-1">
              <Skeleton width="9rem" height="0.85rem" />
              <span className="mt-1 block">
                <Skeleton width="12rem" height="0.7rem" />
              </span>
            </span>
            <Skeleton width="4rem" height="0.8rem" />
            <Skeleton width="6rem" height="0.8rem" />
          </div>
        ))}
      </div>
    </SkeletonRegion>
  )
}

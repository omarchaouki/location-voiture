import { Link, useRouterState } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import type { Locale } from '~/i18n/locales'
import { ADMIN_DESTINATIONS } from '~/ui/nav/destinations'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '~/ui/shadcn/breadcrumb'

/**
 * OÙ SUIS-JE, ET COMMENT JE REMONTE.
 *
 * Signalé le 27/08/2026 : « quand je clique Organisations, il n'y a pas d'option pour
 * retourner au panneau d'administration ». C'était exact, et le défaut était plus
 * profond qu'un lien manquant.
 *
 * La barre latérale porte bien « Vue d'ensemble », mais elle DISPARAÎT sous 1024 px —
 * remplacée par une bande défilante horizontale où la première rubrique se retrouve
 * hors champ dès qu'on est sur la deuxième. Sur un portable de 1280 px avec le
 * navigateur en demi-écran, on est en dessous du seuil : la seule remontée visible
 * était le nom du produit, qui ne se lit pas comme un bouton « retour ».
 *
 * Le fil d'Ariane règle les deux : il est toujours là, quelle que soit la largeur, et
 * il NOMME la destination (« Back-office ») au lieu de compter sur une icône. Sur la
 * page d'accueil de la console il ne montre qu'un seul niveau, sans lien — un fil
 * d'Ariane qui pointe vers la page courante apprend à ne plus être lu.
 *
 * Il se déduit du chemin, jamais d'une prop passée par l'écran : une rubrique ajoutée
 * à `ADMIN_DESTINATIONS` y apparaît sans que personne ait à y penser.
 */
export function AdminBreadcrumb({ locale }: { locale: Locale }) {
  const { t } = useTranslation()
  const pathname = useRouterState({ select: (state) => state.location.pathname })

  const current = ADMIN_DESTINATIONS.find((destination) => {
    if (destination.exact) return false
    const href = destination.to.replace('$lang', locale)
    return pathname.startsWith(href)
  })

  return (
    <Breadcrumb aria-label={t('nav.breadcrumb')} className="mb-4">
      <BreadcrumbList>
        <BreadcrumbItem>
          {current ? (
            <BreadcrumbLink asChild>
              <Link to="/$lang/admin" params={{ lang: locale }}>
                {t('admin.title')}
              </Link>
            </BreadcrumbLink>
          ) : (
            <BreadcrumbPage>{t('admin.title')}</BreadcrumbPage>
          )}
        </BreadcrumbItem>

        {current ? (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{t(current.key)}</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        ) : null}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

import { useNavigate } from '@tanstack/react-router'
import { ChevronDown, LayoutDashboard, LogOut, Receipt, Settings } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { signOut } from '~/auth/client'
import type { Locale } from '~/i18n/locales'
import type { ViewerState } from '~/server/session'
import { Badge } from '~/ui/shadcn/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/ui/shadcn/dropdown-menu'

/**
 * MENU DE COMPTE — qui je suis, où je règle, comment je sors.
 *
 * Trois règles de navigation gouvernent sa forme :
 *
 *  1. **L'identité d'abord, en clair.** Nom, adresse, organisation, rôle. Un agent qui
 *     s'apprête à signer un contrat doit pouvoir vérifier d'un coup d'œil qu'il n'est
 *     pas dans la session de son collègue.
 *  2. **Le rôle est affiché.** Il explique pourquoi certaines actions n'apparaissent
 *     pas — une interface qui cache sans dire pourquoi passe pour cassée.
 *  3. **La déconnexion est séparée** par un filet et portée en `--danger`. Une action
 *     qui fait perdre le contexte de travail ne se place pas à côté de « Réglages ».
 *
 * **Porté sur shadcn/ui le 27/08/2026.** Il était le DERNIER utilisateur du menu
 * maison (`src/ui/overlay/menu.tsx`, 205 lignes), qui a été supprimé avec lui. Le
 * produit embarquait jusque-là deux systèmes de menu — celui de Radix pour le thème
 * et la langue, celui de la maison pour le compte — et payait les deux dans le
 * paquet. Ce que Radix apporte en plus, et qui n'était fait qu'à moitié : le piège de
 * focus, le retour du focus au déclencheur à la fermeture, et la navigation au
 * clavier dans les entrées.
 */
export function AccountMenu({ viewer, locale }: { viewer: ViewerState; locale: Locale }) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const organization = viewer.organization

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('account.menuLabel')}
        className="flex w-full items-center gap-2.5 rounded-md px-2 text-sm text-muted transition-colors hover:bg-surface-sunken hover:text-ink data-[state=open]:bg-surface-sunken"
        style={{ minHeight: 'var(--tap-target)' }}
      >
        <Initials name={viewer.name} />
        {/* Le nom complet à partir de `sm` : sur un téléphone, la barre supérieure
            porte déjà la marque, le thème et la langue. */}
        <span className="hidden max-w-40 truncate sm:inline">{viewer.name}</span>
        <ChevronDown className="size-3.5 shrink-0" aria-hidden="true" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-60">
        <div className="px-2 py-2">
          <p className="text-sm font-medium text-ink">{viewer.name}</p>
          {/* L'adresse peut être longue : elle se coupe proprement plutôt que de
              forcer le panneau à s'élargir. */}
          <p className="truncate text-2xs text-muted" title={viewer.email}>
            {viewer.email}
          </p>

          {organization ? (
            <p className="mt-2.5 flex flex-wrap items-center gap-2">
              <span className="text-xs text-ink">{organization.name}</span>
              <Badge variant="secondary">{t(`role.${organization.role}`)}</Badge>
            </p>
          ) : null}
          {viewer.isPlatformOwner ? (
            <p className="mt-2.5">
              <Badge>{t('account.platformOwner')}</Badge>
            </p>
          ) : null}
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          {organization ? (
            <>
              <DropdownMenuItem
                onSelect={() => {
                  void navigate({ to: '/$lang/app/reglages', params: { lang: locale } })
                }}
              >
                <Settings className="text-muted" aria-hidden="true" />
                <span>{t('nav.settings')}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  void navigate({ to: '/$lang/app/abonnement', params: { lang: locale } })
                }}
              >
                <Receipt className="text-muted" aria-hidden="true" />
                <span>{t('nav.billing')}</span>
              </DropdownMenuItem>
            </>
          ) : null}

          {viewer.isPlatformOwner ? (
            <DropdownMenuItem
              onSelect={() => {
                void navigate({ to: '/$lang/admin', params: { lang: locale } })
              }}
            >
              <LayoutDashboard className="text-muted" aria-hidden="true" />
              <span>{t('admin.title')}</span>
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        {/* Le filet ci-dessus n'est pas décoratif : il sépare une action qui fait
            perdre le contexte de travail des entrées de navigation ordinaires. */}
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => {
            void signOut().then(() => {
              // Rechargement complet : les cookies de session viennent de disparaître,
              // et tout état client survivant parlerait d'une session qui n'existe plus.
              window.location.assign(`/${locale}/connexion`)
            })
          }}
        >
          {/* Icône DIRECTIONNELLE : la porte de sortie se retourne en arabe. */}
          <LogOut className="icon-directional" aria-hidden="true" />
          <span>{t('account.signOut')}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Les initiales.
 *
 * Elles remplacent l'icône générique de personne : deux lettres identifient la
 * session d'un coup d'œil là où une silhouette ne dit rien. `Intl` n'a rien à voir
 * ici — ce ne sont pas des données, c'est un nom propre.
 */
function Initials({ name }: { name: string }) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  const initials = (first + last).toUpperCase() || '—'

  return (
    <span
      aria-hidden="true"
      className="flex size-7 shrink-0 items-center justify-center rounded-md bg-stamp-wash text-2xs font-semibold text-stamp"
    >
      {initials}
    </span>
  )
}

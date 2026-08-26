import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { signOut } from '~/auth/client'
import type { Locale } from '~/i18n/locales'
import type { ViewerState } from '~/server/session'
import { SettingsIcon, SignOutIcon, UserIcon } from '~/ui/icons'
import { Menu, MenuItem, MenuSeparator } from '~/ui/overlay/menu'
import { Stamp } from '~/ui/primitives/stamp'

/**
 * MENU DE COMPTE — qui je suis, où je règle, comment je sors.
 *
 * Il manquait depuis neuf phases : le produit savait parfaitement qui était connecté
 * — le serveur le vérifie à chaque requête — mais **l'écran ne le disait jamais et
 * n'offrait aucun moyen de se déconnecter**. Sur un poste de comptoir partagé entre
 * deux agents, c'est un défaut de sécurité autant qu'un défaut d'ergonomie.
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
 */
export function AccountMenu({ viewer, locale }: { viewer: ViewerState; locale: Locale }) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const organization = viewer.organization

  return (
    <Menu label={t('account.menuLabel')} trigger={<Trigger viewer={viewer} />}>
      <div className="px-4 py-3">
        <p className="text-sm font-medium">{viewer.name}</p>
        {/* L'adresse peut être longue : elle se coupe proprement plutôt que de
            forcer le panneau à s'élargir. */}
        <p className="truncate text-2xs text-muted" title={viewer.email}>
          {viewer.email}
        </p>

        {organization ? (
          <p className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs">{organization.name}</span>
            <Stamp tone="neutral">{t(`role.${organization.role}`)}</Stamp>
          </p>
        ) : null}
        {viewer.isPlatformOwner ? (
          <p className="mt-3">
            <Stamp tone="accent">{t('account.platformOwner')}</Stamp>
          </p>
        ) : null}
      </div>

      <MenuSeparator />

      {organization ? (
        <>
          <MenuItem
            onSelect={() => {
              void navigate({ to: '/$lang/app/reglages', params: { lang: locale } })
            }}
          >
            <SettingsIcon size={16} className="text-muted" />
            <span>{t('nav.settings')}</span>
          </MenuItem>
          <MenuItem
            onSelect={() => {
              void navigate({ to: '/$lang/app/abonnement', params: { lang: locale } })
            }}
          >
            <UserIcon size={16} className="text-muted" />
            <span>{t('nav.billing')}</span>
          </MenuItem>
          <MenuSeparator />
        </>
      ) : null}

      {viewer.isPlatformOwner ? (
        <>
          <MenuItem
            onSelect={() => {
              void navigate({ to: '/$lang/admin', params: { lang: locale } })
            }}
          >
            <SettingsIcon size={16} className="text-muted" />
            <span>{t('admin.title')}</span>
          </MenuItem>
          <MenuSeparator />
        </>
      ) : null}

      {/* Le filet ci-dessus n'est pas décoratif : il sépare une action qui fait perdre
          le contexte de travail des entrées de navigation ordinaires. */}
      <MenuItem
        tone="danger"
        onSelect={() => {
          void signOut().then(() => {
            // Rechargement complet : les cookies de session viennent de disparaître,
            // et tout état client survivant parlerait d'une session qui n'existe plus.
            window.location.assign(`/${locale}/connexion`)
          })
        }}
      >
        <SignOutIcon size={16} directional />
        <span>{t('account.signOut')}</span>
      </MenuItem>
    </Menu>
  )
}

/**
 * Le déclencheur.
 *
 * Le nom complet à partir de `sm`, les initiales en dessous : sur un téléphone, la
 * barre supérieure porte déjà la marque, le thème et la langue. Les initiales gardent
 * la cible tactile à 44 px sans pousser le reste hors de l'écran.
 */
function Trigger({ viewer }: { viewer: ViewerState }) {
  return (
    <>
      <UserIcon size={18} className="text-muted" />
      <span className="hidden max-w-40 truncate sm:inline">{viewer.name}</span>
      <span className="sm:hidden">{initialsOf(viewer.name)}</span>
    </>
  )
}

/** Deux lettres au plus. `Intl` n'a rien à voir ici : ce ne sont pas des données. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '—'
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return (first + last).toUpperCase()
}

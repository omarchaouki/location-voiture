import { createAccessControl } from 'better-auth/plugins/access'
import {
  defaultStatements as adminDefaultStatements,
  userAc,
} from 'better-auth/plugins/admin/access'
import { defaultStatements } from 'better-auth/plugins/organization/access'

/**
 * Rôles internes à une organisation et leurs permissions.
 *
 * La matrice vient de docs/DOMAIN.md §3.1. Elle est déclarée UNE FOIS ici et
 * appliquée côté serveur : aucun écran ne décide d'un droit, il ne fait que refléter
 * ce que le serveur autorise.
 *
 * Les énoncés de Better Auth (`organization`, `member`, `invitation`, `team`, `ac`)
 * sont repris tels quels et fusionnés avec les nôtres — les recopier à la main aurait
 * été le meilleur moyen d'en oublier un au prochain changement de version.
 */

export const statements = {
  ...defaultStatements,

  vehicle: ['read', 'create', 'update', 'delete'],
  customer: ['read', 'create', 'update', 'blacklist'],
  contract: ['read', 'create', 'close', 'cancel'],
  deposit: ['take', 'return'],
  pricing: ['update'],
  maintenance: ['read', 'schedule', 'complete'],
  finance: ['read', 'export'],
  gps: ['read'],
  /** Abonnement de l'organisation : le propriétaire seul. */
  billing: ['read', 'manage'],
  settings: ['read', 'update'],
} as const

export const ac = createAccessControl(statements)

/** Contrôle total, y compris l'abonnement et la suppression de l'organisation. */
export const owner = ac.newRole({
  ...defaultStatements,
  vehicle: ['read', 'create', 'update', 'delete'],
  customer: ['read', 'create', 'update', 'blacklist'],
  contract: ['read', 'create', 'close', 'cancel'],
  deposit: ['take', 'return'],
  pricing: ['update'],
  maintenance: ['read', 'schedule', 'complete'],
  finance: ['read', 'export'],
  gps: ['read'],
  billing: ['read', 'manage'],
  settings: ['read', 'update'],
})

/** Fait tourner l'agence au quotidien, mais ne touche pas à l'abonnement. */
export const manager = ac.newRole({
  organization: ['update'],
  member: [],
  invitation: [],
  vehicle: ['read', 'create', 'update', 'delete'],
  customer: ['read', 'create', 'update', 'blacklist'],
  contract: ['read', 'create', 'close', 'cancel'],
  deposit: ['take', 'return'],
  pricing: ['update'],
  maintenance: ['read', 'schedule', 'complete'],
  finance: ['read', 'export'],
  gps: ['read'],
  billing: ['read'],
  settings: ['read', 'update'],
})

/** Au comptoir : loue, encaisse, restitue. Ne fixe pas les prix, ne voit pas les marges. */
export const agent = ac.newRole({
  vehicle: ['read'],
  customer: ['read', 'create', 'update'],
  contract: ['read', 'create', 'close'],
  deposit: ['take', 'return'],
  maintenance: ['read'],
  gps: ['read'],
  settings: ['read'],
})

/** À l'atelier : voit les véhicules, planifie et clôture les entretiens. Rien d'autre. */
export const mechanic = ac.newRole({
  vehicle: ['read'],
  maintenance: ['read', 'schedule', 'complete'],
  settings: ['read'],
})

/** Lecture seule. Un comptable externe, un associé qui regarde. */
export const viewer = ac.newRole({
  vehicle: ['read'],
  customer: ['read'],
  contract: ['read'],
  maintenance: ['read'],
  gps: ['read'],
  settings: ['read'],
})

export const roles = { owner, manager, agent, mechanic, viewer }

export const ORG_ROLES = ['owner', 'manager', 'agent', 'mechanic', 'viewer'] as const
export type OrgRole = (typeof ORG_ROLES)[number]

export function isOrgRole(value: unknown): value is OrgRole {
  return typeof value === 'string' && (ORG_ROLES as readonly string[]).includes(value)
}

/**
 * Rôle PLATEFORME, strictement séparé des rôles d'organisation.
 * Un `platform_owner` n'est membre d'aucune organisation cliente.
 */
export const PLATFORM_OWNER = 'platform_owner'

/** Rôles en LECTURE SEULE : `assertCanWrite` les refuse en écriture. */
export const READ_ONLY_ROLES: ReadonlySet<string> = new Set(['viewer'])

/* ------------------------------------------------------------------------- */
/* Contrôle d'accès du plugin `admin` — celui de la PLATEFORME, pas des clients */
/* ------------------------------------------------------------------------- */

/**
 * Le plugin `admin` a son propre jeu d'énoncés (`user`, `session`). Il exige que
 * tout rôle cité dans `adminRoles` soit défini ici — d'où ce second contrôle d'accès,
 * volontairement séparé de celui des organisations.
 *
 * `impersonate-admins` n'est PAS accordé : un administrateur de plateforme ne peut
 * pas se glisser dans le compte d'un autre administrateur.
 */
export const platformAc = createAccessControl(adminDefaultStatements)

export const platformOwnerRole = platformAc.newRole({
  user: [
    'create',
    'list',
    'set-role',
    'ban',
    'impersonate',
    'delete',
    'set-password',
    'set-email',
    'get',
    'update',
  ],
  session: ['list', 'revoke', 'delete'],
})

/** Utilisateur ordinaire côté plateforme : aucun pouvoir d'administration. */
export const platformUserRole = userAc

export const platformRoles = {
  [PLATFORM_OWNER]: platformOwnerRole,
  user: platformUserRole,
}

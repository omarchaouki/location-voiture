import type { TenantContext } from '~/db/tenant'
import type { OrgRole } from './permissions'

/**
 * Gardes PURES — celles qui ne touchent ni la base ni la session.
 *
 * Elles vivaient dans `src/auth/context.ts`, qui ouvre la base. Or une server
 * function qui n'a besoin QUE de `requireRole` traînait alors tout le module, donc
 * `~/db/client`, donc **`better-sqlite3` jusque dans le paquet client**. Le pilote
 * natif lève « promisify is not a function » dans le navigateur, React ne s'hydrate
 * pas, et toute l'application cesse de réagir — y compris le formulaire de connexion,
 * qui repart alors en soumission native.
 *
 * D'où ce fichier : une garde qui ne lit rien n'a rien à faire dans un module qui
 * ouvre une connexion. Voir docs/DECISIONS.md §13.7.
 */

/** Levée quand l'utilisateur est authentifié mais n'a pas le droit demandé. */
export class ForbiddenError extends Error {
  constructor(reason: string) {
    super(reason)
    this.name = 'ForbiddenError'
  }
}

/** Exige un rôle précis, en plus de l'appartenance à l'organisation. */
export function requireRole(ctx: TenantContext, ...allowed: ReadonlyArray<OrgRole>): void {
  if (!allowed.includes(ctx.role)) {
    throw new ForbiddenError(`role ${ctx.role} not in [${allowed.join(', ')}]`)
  }
}

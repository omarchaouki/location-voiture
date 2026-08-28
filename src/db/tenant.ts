import type { Db } from './client'

/**
 * Contexte de locataire.
 *
 * Il est construit UNIQUEMENT côté serveur, à partir de la session (le `orgId` vient
 * de `session.activeOrganizationId`), jamais d'un paramètre d'URL ni d'un en-tête
 * envoyé par le client. Voir docs/DECISIONS.md §4.
 */

export type OrgRole = 'owner' | 'manager' | 'agent' | 'mechanic' | 'viewer'

export interface TenantContext {
  readonly orgId: string
  readonly userId: string
  readonly role: OrgRole
  /**
   * Plan de l'organisation. Il ne sert JAMAIS à décider directement — aucun
   * `if (planCode === 'pro')` n'est acceptable (docs/DOMAIN.md §3.2). Il sert de clé
   * de lecture dans `plan_features`, via `can()` : src/server/plan.ts.
   */
  readonly planCode: string
  /**
   * Consultation par un administrateur de plateforme. En impersonation l'écriture
   * est INTERDITE par défaut ; elle demande une activation explicite, expire à
   * 30 minutes, et chaque action part dans `audit_log`.
   */
  readonly impersonated: boolean
  /**
   * Droit d'écrire. Faux si : impersonation non élevée, abonnement en lecture seule,
   * organisation suspendue, ou rôle `viewer`.
   */
  readonly canWrite: boolean
  /** Organisation de démonstration : verrous durs (aucun envoi réel, aucun export de masse). */
  readonly isDemo: boolean
}

/** Levée quand une écriture est tentée sans droit. Jamais un message technique à l'écran. */
export class ReadOnlyError extends Error {
  constructor(readonly reason: 'impersonation' | 'subscription' | 'role' | 'demo') {
    super(`write refused: ${reason}`)
    this.name = 'ReadOnlyError'
  }
}

export function assertCanWrite(ctx: TenantContext): void {
  if (!ctx.canWrite) {
    throw new ReadOnlyError(ctx.impersonated ? 'impersonation' : 'subscription')
  }
}

/**
 * Exécute un travail dans le contexte du locataire.
 *
 * Aujourd'hui c'est une simple délégation : le RLS n'est pas encore écrit, donc rien
 * à poser sur la session.
 * La FORME de l'appel est déjà celle de Postgres, où le corps deviendra :
 *
 * ```ts
 * return db.transaction(async (tx) => {
 *   await tx.execute(sql`select set_config('app.org_id', ${ctx.orgId}, true)`)
 *   return work(tx)
 * })
 * ```
 *
 * C'est pour cela qu'elle existe dès la Phase 1 alors qu'elle ne fait encore rien :
 * le jour de la bascule, il n'y aura rien à réécrire ailleurs. docs/DECISIONS.md §6.
 */
export async function withTenant<T>(
  db: Db,
  ctx: TenantContext,
  work: (tx: Db) => Promise<T> | T,
): Promise<T> {
  void ctx
  return await work(db)
}

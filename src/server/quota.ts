import { checkQuota, type CounterKey } from '~/core/billing'
import type { Db } from '~/db/client'
import { usageCounterRepository } from '~/db/repositories/billing'
import type { TenantContext } from '~/db/tenant'
import { countUsage } from './reads/billing'
import { planLimits } from './plan'

/**
 * QUOTAS — la limite d'une offre, appliquée côté serveur.
 *
 * Trois principes, et le troisième est le seul qui se voie du côté du client :
 *
 *  1. **Le décompte se fait sur le RÉEL**, pas sur `usage_counters`. Un compteur est
 *     une photo : s'il a dérivé, il autoriserait une création de trop ou en refuserait
 *     une de bon droit. Les compteurs servent l'affichage, la vérification compte.
 *  2. **La limite se lit en base** (`plans`), jamais dans le code. Changer une offre
 *     doit être une écriture, pas un déploiement.
 *  3. **Le refus dit la limite atteinte et l'offre requise**, jamais « erreur ». Un
 *     quota est une conversation commerciale : le message doit permettre de décider,
 *     pas d'appeler le support.
 */

export class QuotaExceededError extends Error {
  constructor(
    readonly counter: CounterKey,
    readonly current: number,
    readonly limit: number,
    readonly planCode: string,
  ) {
    super(`quota ${counter} reached: ${current}/${limit} on plan ${planCode}`)
    this.name = 'QuotaExceededError'
  }
}

/**
 * Refuse la création d'une unité de plus si l'offre ne le permet pas.
 *
 * À appeler AVANT l'écriture, dans la server function. Un quota vérifié après coup
 * n'est pas un quota : c'est un compte rendu.
 */
export async function assertQuota(db: Db, ctx: TenantContext, counter: CounterKey): Promise<void> {
  const limits = await planLimits(ctx.planCode, db)
  const usage = await countUsage(db, ctx)
  const verdict = checkQuota(counter, usage[counter], limits)

  if (!verdict.allowed) {
    throw new QuotaExceededError(counter, verdict.current, verdict.limit ?? 0, ctx.planCode)
  }
}

/**
 * Recalcule les compteurs affichés.
 *
 * Ils ne servent qu'à l'affichage — d'où le droit de les recalculer quand on veut, et
 * l'absence totale de conséquence s'ils sont en retard d'une minute.
 */
export async function refreshUsageCounters(db: Db, ctx: TenantContext): Promise<void> {
  const usage = await countUsage(db, ctx)
  const counters = usageCounterRepository(db, ctx)

  for (const [counter, value] of Object.entries(usage)) {
    await counters.record(counter, value)
  }
}

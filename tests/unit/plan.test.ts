import { beforeEach, describe, expect, it } from 'vitest'

import type { Db } from '~/db/client'
import { can, ensurePlanFeatures, FeatureLockedError, assertFeature } from '~/server/plan'
import { createTestDb, tenant } from '../helpers/db'

/**
 * La garde par PLAN.
 *
 * Elle n'est pas la garde par rôle : le rôle dit ce qu'une personne a le droit de
 * faire, le plan dit ce que l'organisation a payé. Un propriétaire — tous les droits —
 * n'ouvre pas une fonctionnalité qui n'est pas dans son offre.
 *
 * Le point à protéger : `can()` lit `plan_features`, et rien d'autre. Le jour où
 * quelqu'un écrira `if (planCode === 'pro')` quelque part, ce test ne le verra pas —
 * mais celui-ci prouve au moins que la table fait autorité.
 */

let db: Db

beforeEach(async () => {
  db = createTestDb()
  await ensurePlanFeatures(db)
})

describe('can()', () => {
  it('ouvre le suivi GPS à une offre qui le comprend', async () => {
    expect(await can(tenant('org-a', { planCode: 'pro' }), 'gps.track', db)).toBe(true)
    expect(await can(tenant('org-a', { planCode: 'business' }), 'gps.track', db)).toBe(true)
  })

  /** L'essai donne tout : une fonctionnalité qu'on ne voit pas ne s'achète jamais. */
  it('ouvre tout pendant l’essai', async () => {
    expect(await can(tenant('org-a', { planCode: 'trial' }), 'gps.track', db)).toBe(true)
  })

  it('le refuse à une offre d’entrée de gamme', async () => {
    expect(await can(tenant('org-a', { planCode: 'starter' }), 'gps.track', db)).toBe(false)
  })

  /** Le silence n'ouvre rien : une ligne absente vaut refus, jamais autorisation. */
  it('refuse une clé inconnue et un plan inconnu', async () => {
    expect(await can(tenant('org-a', { planCode: 'pro' }), 'feature.inventee', db)).toBe(false)
    expect(await can(tenant('org-a', { planCode: 'plan-inexistant' }), 'gps.track', db)).toBe(false)
  })

  it('ne dépend pas du rôle — le plan et le rôle sont deux gardes distinctes', async () => {
    const owner = tenant('org-a', { planCode: 'starter', role: 'owner' })
    expect(await can(owner, 'gps.track', db)).toBe(false)
  })
})

describe('assertFeature()', () => {
  it('lève une erreur qui NOMME la fonctionnalité et le plan', async () => {
    const ctx = tenant('org-a', { planCode: 'starter' })
    await expect(assertFeature(ctx, 'gps.track', db)).rejects.toBeInstanceOf(FeatureLockedError)

    // L'écran a besoin des deux pour écrire une phrase utile, pas un code d'erreur.
    const error = await assertFeature(ctx, 'gps.track', db).catch((caught: unknown) => caught)
    expect(error).toMatchObject({ featureKey: 'gps.track', planCode: 'starter' })
  })

  it('laisse passer quand l’offre couvre la fonctionnalité', async () => {
    await expect(
      assertFeature(tenant('org-a', { planCode: 'pro' }), 'gps.track', db),
    ).resolves.toBeUndefined()
  })
})

describe('ensurePlanFeatures()', () => {
  /** Idempotence portée par l'index unique, comme partout ailleurs dans le produit. */
  it('rejouer la pose de la matrice n’ajoute aucune ligne', async () => {
    expect(await ensurePlanFeatures(db)).toBe(0)
    expect(await ensurePlanFeatures(db)).toBe(0)
  })

  /**
   * `plan_features` est la source de vérité, pas la matrice écrite dans le code : un
   * choix commercial fait en base ne doit pas être écrasé au prochain démarrage.
   */
  it('n’écrase pas un choix commercial fait en base', async () => {
    const { planFeatures } = await import('~/db/schema/billing')
    const { and, eq } = await import('drizzle-orm')

    await db
      .update(planFeatures)
      .set({ enabled: true })
      .where(
        and(eq(planFeatures.planCode, 'starter'), eq(planFeatures.featureKey, 'gps.track')),
      )

    await ensurePlanFeatures(db)
    expect(await can(tenant('org-a', { planCode: 'starter' }), 'gps.track', db)).toBe(true)
  })
})

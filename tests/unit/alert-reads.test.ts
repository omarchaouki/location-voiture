import { beforeEach, describe, expect, it } from 'vitest'

import type { Db } from '~/db/client'
import { alertRepository } from '~/db/repositories/alerts'
import { createTestDb, tenant } from '../helpers/db'

/**
 * L'ÉTAT « LU » DE LA CLOCHE.
 *
 * Le point délicat n'est pas de marquer une notification comme lue — c'est que
 * « lu » ne soit ni « traité » ni partagé entre les collègues. Trois choses
 * distinctes vivent sur la même alerte, et les confondre produit soit un compteur
 * qui ne descend jamais, soit un bouton qui déclare huit échéances réglées.
 *
 * Dates figées : rien ici ne dépend de l'horloge.
 */

const NOW = '2026-08-27T09:00:00.000Z'
const ALPHA = tenant('org-alpha', { userId: 'amina' })
const ALPHA_BIS = tenant('org-alpha', { userId: 'khalid' })
const BRAVO = tenant('org-bravo', { userId: 'youssef' })

let db: Db

/** Pose une alerte ouverte et rend son identifiant. */
async function seedAlert(ctx: typeof ALPHA, suffix: string): Promise<string> {
  const created = await alertRepository(db, ctx).insert({
    entityType: 'vehicle',
    entityId: `v-${suffix}`,
    alertType: 'insurance.expiry',
    thresholdKey: 'd-30',
    periodKey: '2026-09-26',
    severity: 'high',
    state: 'open',
    dueOn: '2026-09-26',
    firstSeenAt: NOW,
    lastSeenAt: NOW,
  })
  return (created as { id: string }).id
}

beforeEach(async () => {
  db = await createTestDb()
})

describe('lecture des notifications', () => {
  it('une alerte neuve n’est lue par personne', async () => {
    await seedAlert(ALPHA, 'a')
    expect((await alertRepository(db, ALPHA).readIdsFor(ALPHA.userId)).size).toBe(0)
  })

  it('marquer comme lu ne vaut que pour la personne qui l’a fait', async () => {
    const id = await seedAlert(ALPHA, 'a')
    await alertRepository(db, ALPHA).markRead([id], ALPHA.userId, NOW)

    // Amina a lu ; Khalid, dans la MÊME agence, ne l'a pas lue.
    expect((await alertRepository(db, ALPHA).readIdsFor(ALPHA.userId)).has(id)).toBe(true)
    expect((await alertRepository(db, ALPHA_BIS).readIdsFor(ALPHA_BIS.userId)).has(id)).toBe(false)
  })

  it('ne touche PAS l’état métier de l’alerte', async () => {
    const id = await seedAlert(ALPHA, 'a')
    await alertRepository(db, ALPHA).markRead([id], ALPHA.userId, NOW)

    // « Lu » n'est pas « traité » : l'échéance reste ouverte, et le moteur
    // continuera de la voir. C'est toute la raison d'être de la table.
    const alert = await alertRepository(db, ALPHA).findById(id)
    expect(alert?.state).toBe('open')
    expect(alert?.acknowledgedBy).toBeNull()
  })

  it('relire ce qui est déjà lu n’écrit rien et n’échoue pas', async () => {
    const id = await seedAlert(ALPHA, 'a')
    const repository = alertRepository(db, ALPHA)

    expect(await repository.markRead([id], ALPHA.userId, NOW)).toBe(1)
    // La cloche renvoie TOUT ce qu'elle affiche, lu ou non : le second appel est le
    // cas courant, pas le cas limite. Il doit être silencieux.
    expect(await repository.markRead([id], ALPHA.userId, NOW)).toBe(0)
    expect((await repository.readIdsFor(ALPHA.userId)).size).toBe(1)
  })

  it('une liste vide ne déclenche aucune écriture', async () => {
    expect(await alertRepository(db, ALPHA).markRead([], ALPHA.userId, NOW)).toBe(0)
  })

  it('les lectures d’une agence sont invisibles à l’autre', async () => {
    const id = await seedAlert(ALPHA, 'a')
    await alertRepository(db, ALPHA).markRead([id], ALPHA.userId, NOW)

    // Même si Bravo devinait l'identifiant, il ne lit pas les lectures d'Alpha.
    expect((await alertRepository(db, BRAVO).readIdsFor(ALPHA.userId)).size).toBe(0)
  })
})

import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import type { Auth } from '~/auth/server'
import type { Db } from '~/db/client'
import { members, organizations, users } from '~/db/schema/auth'
import {
  changeMemberRole,
  createTeamMember,
  listTeam,
  removeTeamMember,
} from '~/server/members-intake'
import { ensurePlans } from '~/server/plan'
import { assertQuota, QuotaExceededError } from '~/server/quota'
import { createTestAuth, signIn } from '../helpers/auth'
import { createTestDb, tenant } from '../helpers/db'

/**
 * LES COMPTES DE L'AGENCE — créés par le gérant, avec leur mot de passe.
 *
 * Le produit ne savait faire entrer quelqu'un que par une invitation envoyée à une
 * adresse électronique. C'est le bon chemin pour un collègue qui relève sa boîte ; ce
 * n'est pas celui d'une agence où trois agents de comptoir se partagent l'adresse du
 * gérant. Un lien d'activation envoyé à une boîte que personne n'ouvre est un accès que
 * personne n'obtient.
 *
 * Deux propriétés sont ici plus importantes que les autres :
 *
 *  1. **le quota de l'offre s'applique**, sinon la grille tarifaire n'a plus de sens ;
 *  2. **une agence ne peut pas se fermer sa propre porte** en retirant ou en
 *     rétrogradant son dernier propriétaire. C'est le genre d'erreur qu'on fait à 18 h
 *     en faisant du ménage, et que seule la plateforme peut ensuite rattraper.
 */

const ATLAS = tenant('org-atlas', { planCode: 'starter' })

let db: Db
let auth: Auth

beforeEach(async () => {
  db = await createTestDb()
  auth = createTestAuth(db)
  await ensurePlans(db)
  await db.insert(organizations).values({
    id: ATLAS.orgId,
    name: 'Atlas Cars',
    slug: 'atlas-cars',
    createdAt: new Date('2026-08-01T09:00:00.000Z'),
    planCode: 'starter',
    status: 'active',
    isDemo: false,
  })
})

function member(index: number, role: 'owner' | 'manager' | 'agent' = 'agent') {
  return {
    name: `Agent ${index}`,
    email: `agent${index}@atlascars.ma`,
    password: 'mot-de-passe-tres-long',
    role,
  }
}

describe('création d’un compte par le gérant', () => {
  it('crée le compte, l’appartenance et le rôle demandé', async () => {
    const created = await createTeamMember(db, auth, ATLAS, member(1, 'manager'))
    expect(created.ok).toBe(true)

    const team = await listTeam(db, ATLAS)
    expect(team).toHaveLength(1)
    expect(team[0]?.email).toBe('agent1@atlascars.ma')
    expect(team[0]?.role).toBe('manager')
  })

  /**
   * Le mot de passe donné de vive voix doit vraiment ouvrir la porte : c'est tout
   * l'intérêt de ce chemin par rapport à l'invitation.
   */
  it('donne un compte avec lequel la personne peut se connecter', async () => {
    await createTeamMember(db, auth, ATLAS, member(2))
    const session = await signIn(auth, {
      email: 'agent2@atlascars.ma',
      password: 'mot-de-passe-tres-long',
    })
    expect(session.userId).toBeTruthy()
  })

  /**
   * L'index sur `users.email` est GLOBAL : une adresse déjà utilisée par une autre
   * agence bloque la création ici. On refuse avec un motif, plutôt que de laisser la
   * contrainte lever une erreur que l'écran ne saurait pas traduire.
   */
  it('refuse une adresse déjà prise, avec son motif', async () => {
    await createTeamMember(db, auth, ATLAS, member(3))
    const again = await createTeamMember(db, auth, ATLAS, member(3))
    expect(again).toEqual({ ok: false, reason: 'email_taken' })
  })

  /**
   * LE QUOTA DE L'OFFRE, qui donne son sens commercial à la grille : trois comptes en
   * Starter. Le refus arrive AVANT l'écriture, et porte de quoi proposer une offre
   * supérieure plutôt qu'une erreur technique.
   */
  it('s’arrête à la limite de comptes de l’offre', async () => {
    await createTeamMember(db, auth, ATLAS, member(10))
    await createTeamMember(db, auth, ATLAS, member(11))
    await createTeamMember(db, auth, ATLAS, member(12))

    // `starter` : trois utilisateurs. Le quatrième est refusé, et le refus dit pourquoi.
    let refusal: unknown
    try {
      await assertQuota(db, ATLAS, 'users')
    } catch (error) {
      refusal = error
    }

    expect(refusal).toBeInstanceOf(QuotaExceededError)
    expect(refusal).toMatchObject({ counter: 'users', current: 3, limit: 3, planCode: 'starter' })
  })
})

describe('rôles et départs', () => {
  it('change le rôle d’un membre', async () => {
    await createTeamMember(db, auth, ATLAS, member(20, 'owner'))
    const created = await createTeamMember(db, auth, ATLAS, member(21))
    expect(created.ok).toBe(true)

    const team = await listTeam(db, ATLAS)
    const target = team.find((row) => row.email === 'agent21@atlascars.ma')!
    expect(await changeMemberRole(db, ATLAS, target.memberId, 'manager')).toEqual({ ok: true })

    const after = await listTeam(db, ATLAS)
    expect(after.find((row) => row.memberId === target.memberId)?.role).toBe('manager')
  })

  it('refuse de rétrograder le dernier propriétaire', async () => {
    await createTeamMember(db, auth, ATLAS, member(30, 'owner'))
    const owner = (await listTeam(db, ATLAS))[0]!

    expect(await changeMemberRole(db, ATLAS, owner.memberId, 'agent')).toEqual({
      ok: false,
      reason: 'last_owner',
    })
  })

  it('refuse de retirer le dernier propriétaire', async () => {
    await createTeamMember(db, auth, ATLAS, member(31, 'owner'))
    const owner = (await listTeam(db, ATLAS))[0]!

    expect(await removeTeamMember(db, ATLAS, owner.memberId)).toEqual({
      ok: false,
      reason: 'last_owner',
    })
    expect(await listTeam(db, ATLAS)).toHaveLength(1)
  })

  it('accepte de retirer un propriétaire quand il en reste un autre', async () => {
    await createTeamMember(db, auth, ATLAS, member(40, 'owner'))
    await createTeamMember(db, auth, ATLAS, member(41, 'owner'))
    const [first] = await listTeam(db, ATLAS)

    expect(await removeTeamMember(db, ATLAS, first!.memberId)).toEqual({ ok: true })
    expect(await listTeam(db, ATLAS)).toHaveLength(1)
  })

  /**
   * ON RETIRE L'APPARTENANCE, JAMAIS LE COMPTE.
   *
   * Le compte porte des actions dans le journal d'audit, et un journal qui désigne un
   * utilisateur disparu n'est plus un journal.
   */
  it('laisse le compte en place après le retrait', async () => {
    await createTeamMember(db, auth, ATLAS, member(50, 'owner'))
    await createTeamMember(db, auth, ATLAS, member(51))
    const target = (await listTeam(db, ATLAS)).find(
      (row) => row.email === 'agent51@atlascars.ma',
    )!

    await removeTeamMember(db, ATLAS, target.memberId)

    const account = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, 'agent51@atlascars.ma'))
    expect(account).toHaveLength(1)
  })

  /**
   * Le cloisonnement, sur le chemin le plus dangereux du module : un identifiant de
   * membre d'une AUTRE agence ne doit rien donner — ni la lecture, ni le retrait.
   */
  it('ignore un membre d’une autre organisation', async () => {
    await createTeamMember(db, auth, ATLAS, member(60, 'owner'))
    const mine = (await listTeam(db, ATLAS))[0]!

    const RIVAGE = tenant('org-rivage', { planCode: 'starter' })
    expect(await removeTeamMember(db, RIVAGE, mine.memberId)).toEqual({
      ok: false,
      reason: 'not_found',
    })
    expect(await changeMemberRole(db, RIVAGE, mine.memberId, 'agent')).toEqual({
      ok: false,
      reason: 'not_found',
    })

    // Et la ligne n'a pas bougé.
    const still = await db.select({ role: members.role }).from(members).where(eq(members.id, mine.memberId))
    expect(still[0]?.role).toBe('owner')
  })
})

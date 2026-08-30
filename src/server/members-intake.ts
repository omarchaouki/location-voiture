import { and, eq } from 'drizzle-orm'

import { ORG_ROLES, type OrgRole } from '~/auth/permissions'
import { closeSignupWindow, openSignupWindow, type Auth } from '~/auth/server'
import type { Db } from '~/db/client'
import { members, users } from '~/db/schema/auth'
import type { TenantContext } from '~/db/tenant'

/**
 * LES COMPTES DE L'AGENCE — créés par le gérant, avec leur mot de passe.
 *
 * Jusqu'ici il n'existait qu'un seul chemin d'entrée : l'invitation par courriel. Elle
 * reste la bonne pour un collègue qui a une adresse et la relève. Elle ne marche pas
 * pour le cas le plus courant d'une agence marocaine : trois agents de comptoir, une
 * seule boîte électronique — celle du gérant —, et des gens qu'on forme le lundi matin
 * en leur donnant un identifiant sur un bout de papier. Un lien d'activation envoyé à
 * une adresse que personne ne relève est un accès que personne n'ouvre.
 *
 * Le gérant crée donc le compte ET son mot de passe, et le communique de vive voix.
 * C'est un compromis assumé — il connaît le mot de passe initial — et c'est exactement
 * le modèle de tous les logiciels de comptoir. La personne peut le changer depuis son
 * écran de compte ; l'invitation par courriel, elle, reste disponible pour qui préfère.
 *
 * **Le quota d'utilisateurs est celui de l'OFFRE**, vérifié côté serveur avant la
 * création. C'est la deuxième limite réellement appliquée du produit après celle des
 * véhicules, et c'est elle qui donne un sens commercial à la grille tarifaire : trois
 * comptes en Starter, huit en Pro, quinze en Business.
 *
 * Hors du module de server functions : il importe l'authentification et la base.
 */

export interface TeamMember {
  userId: string
  memberId: string
  name: string
  email: string
  role: OrgRole
  /** Vrai pour la personne connectée : l'écran ne lui propose pas de se retirer. */
  isSelf: boolean
}

export type MemberRefusal = 'email_taken' | 'quota' | 'last_owner' | 'not_found'

export async function listTeam(db: Db, ctx: TenantContext): Promise<TeamMember[]> {
  const rows = await db
    .select({
      memberId: members.id,
      userId: users.id,
      name: users.name,
      email: users.email,
      role: members.role,
    })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .where(eq(members.organizationId, ctx.orgId))
    .orderBy(members.createdAt)

  return rows.map((row) => ({
    memberId: row.memberId,
    userId: row.userId,
    name: row.name,
    email: row.email,
    role: (ORG_ROLES as readonly string[]).includes(row.role) ? (row.role as OrgRole) : 'viewer',
    isSelf: row.userId === ctx.userId,
  }))
}

export async function createTeamMember(
  db: Db,
  auth: Auth,
  ctx: TenantContext,
  input: { name: string; email: string; password: string; role: OrgRole },
): Promise<{ ok: true; userId: string } | { ok: false; reason: MemberRefusal }> {
  const email = input.email.trim().toLowerCase()

  /*
   * UNE ADRESSE, UN COMPTE, sur toute la plateforme.
   *
   * L'index unique sur `users.email` est global : une adresse déjà utilisée par une
   * AUTRE agence bloque la création ici, et c'est le comportement voulu — deux agences
   * ne partagent pas un compte. On refuse donc avec un motif, plutôt que de laisser
   * l'index lever une erreur de contrainte que l'écran ne saurait pas traduire.
   */
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1)
  if (existing.length > 0) return { ok: false, reason: 'email_taken' }

  openSignupWindow(email)
  let created: Response
  try {
    created = await auth.api.signUpEmail({
      body: { email, password: input.password, name: input.name },
      asResponse: true,
    })
  } finally {
    closeSignupWindow(email)
  }
  if (!created.ok) return { ok: false, reason: 'email_taken' }

  const body = (await created.clone().json()) as { user?: { id?: string } }
  const userId = body.user?.id
  if (!userId) return { ok: false, reason: 'email_taken' }

  await db.insert(members).values({
    id: crypto.randomUUID(),
    organizationId: ctx.orgId,
    userId,
    role: input.role,
    createdAt: new Date(),
  })

  return { ok: true, userId }
}

/**
 * Change le rôle d'un membre, ou le retire de l'agence.
 *
 * **La dernière personne `owner` ne peut être ni rétrogradée ni retirée.** Sans cette
 * règle, une agence peut se fermer sa propre porte : plus aucun compte n'a le droit de
 * toucher aux réglages, à l'offre, ni aux membres, et seule la plateforme peut
 * rattraper le coup. C'est le genre d'erreur qu'on fait à 18 h en faisant du ménage.
 */
export async function changeMemberRole(
  db: Db,
  ctx: TenantContext,
  memberId: string,
  role: OrgRole,
): Promise<{ ok: true } | { ok: false; reason: MemberRefusal }> {
  const target = await findMember(db, ctx, memberId)
  if (!target) return { ok: false, reason: 'not_found' }

  if (target.role === 'owner' && role !== 'owner' && (await countOwners(db, ctx)) <= 1) {
    return { ok: false, reason: 'last_owner' }
  }

  await db.update(members).set({ role }).where(eq(members.id, memberId))
  return { ok: true }
}

export async function removeTeamMember(
  db: Db,
  ctx: TenantContext,
  memberId: string,
): Promise<{ ok: true } | { ok: false; reason: MemberRefusal }> {
  const target = await findMember(db, ctx, memberId)
  if (!target) return { ok: false, reason: 'not_found' }

  if (target.role === 'owner' && (await countOwners(db, ctx)) <= 1) {
    return { ok: false, reason: 'last_owner' }
  }

  /*
   * On retire l'APPARTENANCE, jamais le compte.
   *
   * `members` est une table Better Auth sans `deleted_at` : l'effacement y est dur, et
   * c'est cohérent — l'appartenance est un lien, pas un fait historique. Le compte
   * `users`, lui, reste : il porte des actions dans le journal d'audit, et un journal
   * qui désigne un utilisateur disparu n'est plus un journal.
   */
  await db.delete(members).where(eq(members.id, memberId))
  return { ok: true }
}

/** Le membre, borné à l'organisation de la session. Une autre agence rend `undefined`. */
async function findMember(
  db: Db,
  ctx: TenantContext,
  memberId: string,
): Promise<{ role: string } | undefined> {
  const rows = await db
    .select({ role: members.role })
    .from(members)
    .where(and(eq(members.id, memberId), eq(members.organizationId, ctx.orgId)))
    .limit(1)
  return rows[0]
}

async function countOwners(db: Db, ctx: TenantContext): Promise<number> {
  const rows = await db
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.organizationId, ctx.orgId), eq(members.role, 'owner')))
  return rows.length
}

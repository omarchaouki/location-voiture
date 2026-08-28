import { beforeEach, describe, expect, it } from 'vitest'

import type { Auth } from '~/auth/server'
import type { Db } from '~/db/client'
import { createTestDb } from '../helpers/db'
import { bootstrapAdmin, captureNotifications, createTestAuth, signUp } from '../helpers/auth'
import type { NotificationMessage } from '~/server/notifier'
import type { OrgRole } from '~/auth/permissions'

/**
 * Le flux d'accès du cahier des charges §1, prouvé de bout en bout :
 *
 *   pas d'inscription publique → le super administrateur crée l'organisation
 *   → il invite le propriétaire → celui-ci accepte → il entre dans son espace.
 *
 * Ces tests passent par la vraie pile Better Auth, sur une base migrée en mémoire.
 */

let db: Db
let auth: Auth
let sent: NotificationMessage[]

beforeEach(async () => {
  db = await createTestDb()
  auth = createTestAuth(db)
  sent = captureNotifications()
})

function createPlatformOwner() {
  return bootstrapAdmin(db, auth, {
    email: 'admin@registre.ma',
    password: 'mot-de-passe-tres-long',
    name: 'Super administrateur',
  })
}

/** Invite une adresse pour pouvoir la faire s'inscrire ensuite. */
async function inviteInto(orgId: string, email: string, adminHeaders: Headers) {
  return auth.api.createInvitation({
    body: { email, role: 'owner', organizationId: orgId },
    headers: adminHeaders,
  })
}

describe('inscription publique', () => {
  /**
   * LA règle d'accès du produit (cahier des charges §1) : on ne s'inscrit pas, on est
   * invité. Le contrôle est sur l'endpoint, pas seulement dans l'absence de page —
   * appeler `/api/auth/sign-up/email` directement doit échouer aussi.
   */
  it('refuse une inscription sans invitation', async () => {
    await expect(
      signUp(auth, {
        email: 'inconnu@ailleurs.ma',
        password: 'mot-de-passe-tres-long',
        name: 'Inconnu',
      }),
    ).rejects.toThrow(/INVITATION_REQUIRED|invitation only/i)
  })

  it('accepte une inscription couverte par une invitation en cours', async () => {
    const admin = await createPlatformOwner()
    const org = await auth.api.createOrganization({
      body: { name: 'Atlas Cars', slug: 'atlas-cars', localeDefault: 'fr' },
      headers: admin.headers,
    })
    if (!org) throw new Error('organisation non créée')
    await inviteInto(org.id, 'gerant@atlas.ma', admin.headers)

    const user = await signUp(auth, {
      email: 'gerant@atlas.ma',
      password: 'mot-de-passe-tres-long',
      name: 'Gérant Atlas',
    })

    const session = await auth.api.getSession({ headers: user.headers })
    expect(session?.user.email).toBe('gerant@atlas.ma')
    // Aucune organisation active tant que l'invitation n'est pas acceptée.
    expect(session?.session.activeOrganizationId ?? null).toBeNull()
  })

  it('refuse un mot de passe trop court', async () => {
    const admin = await createPlatformOwner()
    const org = await auth.api.createOrganization({
      body: { name: 'Atlas Cars', slug: 'atlas-cars', localeDefault: 'fr' },
      headers: admin.headers,
    })
    if (!org) throw new Error('organisation non créée')
    await inviteInto(org.id, 'court@atlas.ma', admin.headers)

    await expect(
      signUp(auth, { email: 'court@atlas.ma', password: 'court', name: 'Court' }),
    ).rejects.toThrow()
  })
})

describe('organisations', () => {
  it('un client ordinaire ne peut PAS créer d’organisation', async () => {
    const admin = await createPlatformOwner()
    const first = await auth.api.createOrganization({
      body: { name: 'Première', slug: 'premiere', localeDefault: 'fr' },
      headers: admin.headers,
    })
    if (!first) throw new Error('organisation non créée')
    await inviteInto(first.id, 'client@atlas.ma', admin.headers)

    const user = await signUp(auth, {
      email: 'client@atlas.ma',
      password: 'mot-de-passe-tres-long',
      name: 'Client',
    })

    await expect(
      auth.api.createOrganization({
        body: { name: 'Atlas Cars', slug: 'atlas-cars' },
        headers: user.headers,
      }),
    ).rejects.toThrow()
  })

  it('le super administrateur crée une organisation avec ses champs métier', async () => {
    const admin = await createPlatformOwner()

    const org = await auth.api.createOrganization({
      body: {
        name: 'Atlas Cars Marrakech',
        slug: 'atlas-cars-marrakech',
        city: 'Marrakech',
        planCode: 'starter',
        localeDefault: 'fr',
      },
      headers: admin.headers,
    })

    expect(org?.name).toBe('Atlas Cars Marrakech')
    // Les `additionalFields` sont bien persistés sur la table `organizations`.
    expect((org as unknown as { city?: string }).city).toBe('Marrakech')
    expect((org as unknown as { planCode?: string }).planCode).toBe('starter')
  })
})

describe('invitations', () => {
  async function organizationWithInvite(role: OrgRole = 'owner') {
    const admin = await createPlatformOwner()
    const org = await auth.api.createOrganization({
      body: { name: 'Sahara Rent', slug: 'sahara-rent', localeDefault: 'fr' },
      headers: admin.headers,
    })
    if (!org) throw new Error('organisation non créée')

    const invitation = await auth.api.createInvitation({
      body: { email: 'proprietaire@sahara.ma', role, organizationId: org.id },
      headers: admin.headers,
    })
    return { admin, org, invitation }
  }

  it('envoie un lien à usage unique, valable 7 jours', async () => {
    const { invitation } = await organizationWithInvite()

    expect(invitation.status).toBe('pending')
    // 7 jours ± une minute de marge d'exécution.
    const days = (invitation.expiresAt.getTime() - Date.now()) / 86_400_000
    expect(days).toBeGreaterThan(6.99)
    expect(days).toBeLessThan(7.01)

    // Une notification est partie, avec le lien.
    expect(sent).toHaveLength(1)
    expect(sent[0]?.to).toBe('proprietaire@sahara.ma')
    expect(sent[0]?.body).toContain(`/fr/invitation/${invitation.id}`)
  })

  it('l’invité devient membre après acceptation, et une seule fois', async () => {
    const { org, invitation } = await organizationWithInvite()

    const invitee = await signUp(auth, {
      email: 'proprietaire@sahara.ma',
      password: 'mot-de-passe-tres-long',
      name: 'Propriétaire Sahara',
    })

    const accepted = await auth.api.acceptInvitation({
      body: { invitationId: invitation.id },
      headers: invitee.headers,
    })
    expect(accepted?.member.role).toBe('owner')
    expect(accepted?.member.organizationId).toBe(org.id)

    // Jeton à usage unique : la seconde tentative échoue.
    await expect(
      auth.api.acceptInvitation({
        body: { invitationId: invitation.id },
        headers: invitee.headers,
      }),
    ).rejects.toThrow()
  })

  it('une invitation ne peut pas être acceptée par une autre adresse', async () => {
    const { admin, org, invitation } = await organizationWithInvite()

    // L'intrus a bien un compte légitime — il a été invité, lui aussi. Ce qu'on
    // vérifie ici, c'est qu'un compte valide ne peut pas consommer l'invitation
    // d'un autre.
    await inviteInto(org.id, 'intrus@ailleurs.ma', admin.headers)
    const intrus = await signUp(auth, {
      email: 'intrus@ailleurs.ma',
      password: 'mot-de-passe-tres-long',
      name: 'Intrus',
    })

    await expect(
      auth.api.acceptInvitation({
        body: { invitationId: invitation.id },
        headers: intrus.headers,
      }),
    ).rejects.toThrow()
  })

  it('une invitation révoquée n’est plus acceptable', async () => {
    const { admin, invitation } = await organizationWithInvite()

    // Le compte est créé pendant que l'invitation est encore valable…
    const invitee = await signUp(auth, {
      email: 'proprietaire@sahara.ma',
      password: 'mot-de-passe-tres-long',
      name: 'Propriétaire Sahara',
    })

    // …puis l'administrateur révoque l'invitation avant qu'elle soit acceptée.
    await auth.api.cancelInvitation({
      body: { invitationId: invitation.id },
      headers: admin.headers,
    })

    await expect(
      auth.api.acceptInvitation({
        body: { invitationId: invitation.id },
        headers: invitee.headers,
      }),
    ).rejects.toThrow()
  })
})

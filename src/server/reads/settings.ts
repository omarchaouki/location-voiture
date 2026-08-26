import { eq } from 'drizzle-orm'

import type { Db } from '~/db/client'
import { organizations } from '~/db/schema/auth'
import type { TenantContext } from '~/db/tenant'
import type { OrganizationSettings } from '../settings'

/**
 * Lecture et écriture de l'identité d'une organisation.
 *
 * `organizations` est une table Better Auth : elle n'a pas d'`org_id` (elle EST
 * l'organisation) et ne passe donc pas par `forOrg`. La portée vient de l'`orgId` du
 * contexte, qui vient de la session — jamais d'un paramètre reçu.
 */

const EDITING_ROLES: ReadonlySet<string> = new Set(['owner', 'manager'])

export async function readOrganizationSettings(
  db: Db,
  ctx: TenantContext,
): Promise<OrganizationSettings> {
  const rows = await db
    .select({
      name: organizations.name,
      city: organizations.city,
      contactPhone: organizations.contactPhone,
      contactEmail: organizations.contactEmail,
      localeDefault: organizations.localeDefault,
      timezone: organizations.timezone,
      planCode: organizations.planCode,
      status: organizations.status,
    })
    .from(organizations)
    .where(eq(organizations.id, ctx.orgId))
    .limit(1)

  const org = rows[0]
  if (!org) throw new Error(`organisation introuvable: ${ctx.orgId}`)

  return {
    ...org,
    /*
     * `canEdit` combine le RÔLE et le droit d'écrire.
     *
     * Un gérant d'une organisation en lecture seule (impayé, impersonation non
     * élevée) voit ses réglages en consultation : l'écran doit le refléter, sinon il
     * propose un bouton qui échouera. Le refus reste porté par le serveur.
     */
    canEdit: EDITING_ROLES.has(ctx.role) && ctx.canWrite,
  }
}

export async function writeOrganizationSettings(
  db: Db,
  ctx: TenantContext,
  values: {
    name: string
    city: string | null
    contactPhone: string | null
    contactEmail: string | null
    localeDefault: string
  },
): Promise<void> {
  await db
    .update(organizations)
    .set({
      name: values.name,
      city: values.city,
      contactPhone: values.contactPhone,
      contactEmail: values.contactEmail,
      localeDefault: values.localeDefault,
    })
    .where(eq(organizations.id, ctx.orgId))
}

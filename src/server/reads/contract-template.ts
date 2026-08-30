import { eq } from 'drizzle-orm'
import type { z } from 'zod'

import {
  defaultTemplate,
  parseBlocks,
  type TemplateBlocks,
  type TemplateVariable,
  type VariableValues,
} from '~/core/contract-template'
import { formatPlate, parsePlate } from '~/core/plate'
import type { Db } from '~/db/client'
import { forOrg } from '~/db/repositories/base'
import { contractRepository, customerRepository } from '~/db/repositories/rental'
import { vehicleRepository } from '~/db/repositories/vehicles'
import { organizations } from '~/db/schema/auth'
import { contractTemplates } from '~/db/schema/contracts'
import { formatDateTime, formatMoney, formatNumber } from '~/i18n/format'
import { isLocale } from '~/i18n/locales'
import type { TenantContext } from '~/db/tenant'

/**
 * Lecture et écriture du modèle de contrat.
 *
 * `contract_templates` porte `org_id`, `deleted_at` et `id` : c'est une table
 * cloisonnée ordinaire, elle passe donc par `forOrg` comme toutes les autres, et
 * `pnpm check:hardcoded` le vérifie.
 */

type TemplateRow = typeof contractTemplates.$inferSelect

export interface StoredTemplate {
  id: string | null
  name: string
  locale: string
  blocks: z.infer<typeof TemplateBlocks>
}

/**
 * Le modèle par défaut de l'agence, ou celui du produit si elle n'en a posé aucun.
 *
 * **Le repli n'est PAS écrit en base à la lecture.** Une lecture qui écrit est une
 * lecture qui se déclenche depuis n'importe où — l'ouverture d'une fiche contrat, une
 * impression, un balayage périodique — et qui poserait des lignes dans les agences qui
 * n'ont jamais ouvert cet écran. Le modèle du produit sert donc de contenu tant que
 * personne n'a enregistré : `id` vaut `null`, et c'est ce qui dit à l'écran qu'il
 * montre une proposition et non un choix.
 */
export async function readContractTemplate(
  db: Db,
  ctx: TenantContext,
): Promise<StoredTemplate> {
  const repository = forOrg<TemplateRow>(db, ctx, contractTemplates)
  const rows = await repository.list(eq(contractTemplates.isDefault, true))
  const row = rows[0]

  if (!row) {
    /*
     * La langue du contrat proposé suit celle du contexte de l'agence, sans jamais
     * sortir des quatre que le modèle connaît. Une organisation dont `locale_default`
     * serait corrompu retombe sur le français plutôt que de rendre un modèle vide.
     */
    const agency = await db
      .select({ locale: organizations.localeDefault })
      .from(organizations)
      .where(eq(organizations.id, ctx.orgId))
      .limit(1)

    const declared = agency[0]?.locale
    const locale = isLocale(declared) ? declared : 'fr'
    return { id: null, name: '', locale, blocks: defaultTemplate(locale) }
  }

  return {
    id: row.id,
    name: row.name,
    locale: row.locale,
    blocks: parseBlocks(row.blocksJson),
  }
}

/**
 * Enregistre le modèle par défaut de l'agence — en corrigeant celui qui existe.
 *
 * Une seule ligne par organisation aujourd'hui, garantie par l'index unique partiel sur
 * `is_default`. La table en accepte plusieurs par construction — une agence de Tanger
 * voudra un contrat en français et un en arabe — mais l'écran n'en pilote qu'un, et
 * poser la table dans sa forme définitive coûte moins cher qu'une migration plus tard.
 */
export async function writeContractTemplate(
  db: Db,
  ctx: TenantContext,
  values: { name: string; locale: string; blocks: z.infer<typeof TemplateBlocks> },
): Promise<{ id: string }> {
  const repository = forOrg<TemplateRow>(db, ctx, contractTemplates)
  const existing = (await repository.list(eq(contractTemplates.isDefault, true)))[0]

  const payload = {
    name: values.name,
    locale: values.locale,
    blocksJson: JSON.stringify(values.blocks),
    isDefault: true,
  }

  if (existing) {
    await repository.update(existing.id, payload)
    return { id: existing.id }
  }

  const created = await repository.insert(payload)
  return { id: created.id }
}

/**
 * LES VALEURS DES VARIABLES pour un contrat donné.
 *
 * Formatées ICI, côté serveur, dans la langue du CONTRAT — pas dans celle de
 * l'utilisateur. C'est la subtilité de cet écran : un gérant francophone peut imprimer
 * un contrat en arabe pour un client marocain, et les montants doivent alors suivre
 * `ar-MA` et non `fr-MA`. Formater côté écran aurait pris la langue de l'interface, et
 * personne ne s'en serait aperçu avant qu'un contrat parte avec des milliers séparés à
 * l'anglaise.
 *
 * Une donnée absente reste ABSENTE : `fillVariables` la remplace par des points de
 * conduite, qu'on complète au stylo. Inventer une valeur par défaut ferait imprimer un
 * contrat qui affirme quelque chose de faux.
 */
export async function readContractTerms(
  db: Db,
  ctx: TenantContext,
  contractId: string,
): Promise<{ blocks: z.infer<typeof TemplateBlocks>; values: VariableValues } | null> {
  const contracts = contractRepository(db, ctx)
  const contract = await contracts.findById(contractId)
  // Contrat d'une autre organisation : `null`, et l'appelant rend 404.
  if (!contract) return null

  const template = await readContractTemplate(db, ctx)
  const locale = isLocale(template.locale) ? template.locale : 'fr'

  const [vehicle, customer, agencyRows] = await Promise.all([
    vehicleRepository(db, ctx).findById(contract.vehicleId),
    customerRepository(db, ctx).findById(contract.customerId),
    db
      .select({
        name: organizations.name,
        city: organizations.city,
        phone: organizations.contactPhone,
        email: organizations.contactEmail,
      })
      .from(organizations)
      .where(eq(organizations.id, ctx.orgId))
      .limit(1),
  ])

  const agency = agencyRows[0]
  const money = (cents: number) => formatMoney(cents, locale, contract.currency)

  const values: VariableValues = {
    ...defined('agency.name', agency?.name),
    ...defined('agency.city', agency?.city),
    ...defined('agency.phone', agency?.phone),
    ...defined('agency.email', agency?.email),

    'contract.reference': contract.reference,
    'contract.startAt': formatDateTime(contract.actualStartAt ?? contract.plannedStartAt, locale),
    'contract.endAt': formatDateTime(contract.actualEndAt ?? contract.plannedEndAt, locale),
    'contract.days': formatNumber(contract.daysBilled, locale),
    'contract.dailyPrice': money(contract.dailyCents),
    'contract.total': money(contract.totalCents),
    'contract.deposit': money(contract.depositCents),

    ...defined('customer.name', customer ? customerRepository(db, ctx).label(customer) : null),
    ...defined('customer.idNumber', customer?.idNumber),
    ...defined('customer.licenceNumber', customer?.licenceNumber),
    ...defined('customer.phone', customer?.phone),
    ...defined('customer.address', customer?.address),

    ...defined('vehicle.plate', vehicle ? plateOf(vehicle.plate) : null),
    ...defined('vehicle.make', vehicle?.make),
    ...defined('vehicle.model', vehicle?.model),
    ...defined(
      'vehicle.km',
      contract.startKm === null ? null : formatNumber(contract.startKm, locale),
    ),
  }

  return { blocks: template.blocks, values }
}

/**
 * Une entrée SEULEMENT si la valeur existe.
 *
 * `exactOptionalPropertyTypes` est actif : une clé présente valant `undefined` n'est
 * pas la même chose qu'une clé absente, et `fillVariables` distingue les deux — la
 * première imprimerait « undefined », la seconde des points de conduite.
 */
function defined(key: TemplateVariable, value: string | null | undefined): VariableValues {
  return value === null || value === undefined || value === '' ? {} : { [key]: value }
}

/** La plaque sous sa forme d'affichage, jamais sa clé normalisée. */
function plateOf(plate: string): string {
  const parsed = parsePlate(plate)
  return parsed ? formatPlate(parsed) : plate
}

/**
 * Désigner une organisation en ligne de commande, et refuser de deviner.
 *
 * Partagé par `pnpm demo:fill` et `pnpm demo:purge`. Les deux écrivent — l'une efface
 * avant de semer, l'autre ne fait qu'effacer — et aucune ne doit pouvoir se tromper de
 * cible. D'où trois règles :
 *
 *  1. La cible est TOUJOURS explicite (`--org`). Il n'y a pas de valeur par défaut, pas
 *     de « la première organisation », pas de « celle qui est en essai ».
 *  2. Un slug ambigu ou introuvable arrête le script, il ne choisit pas.
 *  3. Une organisation effacée (`deleted_at`) n'est jamais une cible.
 */

import { and, eq, isNull, or } from 'drizzle-orm'

import type { Db } from '~/db/client'
import { organizations } from '~/db/schema/auth'

export interface OrgTarget {
  id: string
  slug: string
  name: string
  planCode: string
  status: string
  isDemo: boolean
}

/** Lit un drapeau `--nom valeur`. Rend `undefined` quand il est absent. */
export function flag(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(`--${name}`)
  if (index === -1) return undefined
  return argv[index + 1]
}

/** Lit un drapeau numérique, avec sa valeur par défaut. Refuse ce qui n'est pas un entier positif. */
export function numberFlag(argv: readonly string[], name: string, fallback: number): number {
  const raw = flag(argv, name)
  if (raw === undefined) return fallback

  const value = Number(raw)
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`--${name} attend un entier positif, reçu « ${raw} »`)
  }
  return value
}

/** Vrai si le drapeau est présent, sans valeur attendue. */
export function hasFlag(argv: readonly string[], name: string): boolean {
  return argv.includes(`--${name}`)
}

/**
 * Résout `--org` en une organisation vivante. Accepte le slug ou l'identifiant.
 *
 * Elle lit `organizations`, qui est une table de PLATEFORME — pas de `org_id`, donc
 * pas de cloisonnement à traverser. C'est la seule lecture directe que ces scripts
 * s'autorisent, et elle est ici pour ne pas être recopiée ailleurs.
 */
export async function resolveOrg(db: Db, argv: readonly string[]): Promise<OrgTarget> {
  const needle = flag(argv, 'org')
  if (!needle) {
    throw new Error('précisez la cible : --org <slug|id>')
  }

  const rows = await db
    .select({
      id: organizations.id,
      slug: organizations.slug,
      name: organizations.name,
      planCode: organizations.planCode,
      status: organizations.status,
      isDemo: organizations.isDemo,
    })
    .from(organizations)
    .where(
      and(
        or(eq(organizations.slug, needle), eq(organizations.id, needle)),
        isNull(organizations.deletedAt),
      ),
    )

  const found = rows[0]
  if (!found) throw new Error(`aucune organisation vivante pour « ${needle} »`)
  if (rows.length > 1) throw new Error(`« ${needle} » désigne ${rows.length} organisations`)

  return { ...found, slug: found.slug ?? needle }
}

/**
 * Le GARDE-FOU des commandes destructives : retaper le slug de la cible.
 *
 * Pas un `--yes`, pas un `--force`. Un drapeau générique se colle par réflexe au bout
 * d'une commande qui vient d'échouer, et il vaut alors pour n'importe quelle cible.
 * Le slug, lui, ne s'écrit pas par accident : le taper, c'est nommer ce qu'on efface.
 */
export function assertConfirmed(argv: readonly string[], target: OrgTarget): void {
  const given = flag(argv, 'confirm')
  if (given === target.slug) return

  throw new Error(
    given === undefined
      ? `refus : ajoutez --confirm ${target.slug} pour confirmer la cible`
      : `refus : --confirm « ${given} » ne correspond pas à « ${target.slug} »`,
  )
}

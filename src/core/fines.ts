/**
 * AMENDES — rattachement au conducteur.
 *
 * Module pur. La règle tient en une phrase et elle est délicate : on rattache une
 * contravention au contrat qui était actif À L'INSTANT de l'infraction, et seulement
 * s'il n'y a AUCUN doute.
 *
 * Deviner ici, c'est refacturer une amende au mauvais client. Un loueur qui envoie
 * une contravention de 700 dirhams à quelqu'un qui n'avait pas la voiture perd le
 * client et la confiance ; le produit doit donc préférer ne rien dire.
 */

export interface FineCandidate {
  id: string
  reference: string
  customerId: string
  customerLabel: string
  /** Départ réel si connu, sinon départ prévu. */
  startAt: string
  /** Retour réel si connu, sinon `null` : le contrat est encore ouvert. */
  endAt: string | null
  status: string
}

export type FineAttachment =
  | { kind: 'attached'; contract: FineCandidate }
  | { kind: 'none' }
  | { kind: 'ambiguous'; candidates: FineCandidate[] }

/**
 * Statuts qui signifient que la voiture était bien chez le client.
 *
 * Exporté parce que le GPS pose la même question sous un autre angle — « cette
 * voiture roulait-elle sous contrat à cet instant ? » (src/core/tracking.ts). Deux
 * copies de cette liste finiraient par diverger, et l'une des deux se tromperait.
 */
export const HELD_STATUSES: ReadonlySet<string> = new Set(['active', 'late', 'returned'])

const HELD = HELD_STATUSES

/**
 * Trouve le contrat actif à un instant donné.
 *
 * Bornes : `startAt <= offenceAt <= endAt`, un contrat encore ouvert (`endAt` nul)
 * couvrant tout ce qui suit son départ. Les bornes sont INCLUSIVES : une infraction
 * commise à la minute du départ est bien du fait du client.
 *
 * Renvoie explicitement `ambiguous` quand plusieurs contrats se recouvrent — cela ne
 * devrait pas arriver (invariant 3) mais peut résulter d'une saisie manuelle, et la
 * bonne réponse est alors de demander, pas de choisir.
 */
export function attachFine(
  offenceAt: string,
  contracts: ReadonlyArray<FineCandidate>,
): FineAttachment {
  const instant = Date.parse(offenceAt)
  if (!Number.isFinite(instant)) return { kind: 'none' }

  const matches = contracts.filter((contract) => {
    if (!HELD.has(contract.status)) return false

    const start = Date.parse(contract.startAt)
    if (!Number.isFinite(start) || instant < start) return false

    if (contract.endAt === null) return true
    const end = Date.parse(contract.endAt)
    return Number.isFinite(end) && instant <= end
  })

  if (matches.length === 1) return { kind: 'attached', contract: matches[0]! }
  if (matches.length === 0) return { kind: 'none' }
  return { kind: 'ambiguous', candidates: matches }
}

/* ------------------------------------------------------------- refacturation */

export type FineStatus = 'open' | 'paid' | 'contested' | 'rebilled'

/**
 * Une amende ne se refacture qu'une fois, et seulement si elle est rattachée.
 * Refacturer une amende non rattachée reviendrait à choisir un client au hasard.
 */
export function canRebill(fine: {
  contractId: string | null
  status: FineStatus
}): boolean {
  return fine.contractId !== null && fine.status !== 'rebilled'
}

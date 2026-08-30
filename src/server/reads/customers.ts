import type { Db } from '~/db/client'
import { contractRepository, customerRepository } from '~/db/repositories/rental'
import type { TenantContext } from '~/db/tenant'
import type { CustomerLedger, CustomersLedger } from '../customers'

/**
 * QUI DOIT ENCORE DE L'ARGENT — le tableau que le gérant regarde le lundi matin.
 *
 * La liste des clients disait la validité du permis, ce qui est ce dont on a besoin au
 * COMPTOIR. Elle ne disait rien de ce dont on a besoin au BUREAU : qui a payé, qui n'a
 * pas payé, et combien. Ce chiffre-là existait pourtant déjà, éparpillé — un statut par
 * contrat, des encaissements dans une autre table — et se reconstituait à la main,
 * contrat par contrat, dans un carnet à côté du clavier.
 *
 * **Le solde est CALCULÉ, jamais lu dans `contracts.payment_status`.** Ce statut est un
 * résumé écrit à la main au moment de l'encaissement ; il peut être en retard sur les
 * lignes de `contract_payments`, qui, elles, sont des faits. Un client dont on aurait
 * oublié de repasser le contrat en « payé » apparaîtrait comme débiteur — et on
 * l'appellerait pour rien, ce qui est la seule façon sûre de faire cesser d'utiliser un
 * tableau de relance.
 *
 * **Un contrat ANNULÉ ne doit rien.** C'est le seul statut écarté du décompte : une
 * réservation annulée porte un total, et le compter ferait apparaître des créances qui
 * n'ont jamais existé.
 *
 * TROIS requêtes, quelle que soit la taille du fichier client — c'est l'interdiction du
 * N+1 de docs/DOMAIN.md §7, la même que pour la liste des véhicules. Les contrats et
 * les encaissements sont lus en un balayage chacun et rapprochés en mémoire.
 */

/** Statuts qui ne représentent aucune créance. Une annulation n'est pas une dette. */
const NON_BILLABLE: ReadonlySet<string> = new Set(['cancelled'])

export async function readCustomersLedger(
  db: Db,
  ctx: TenantContext,
): Promise<CustomersLedger> {
  const customers = customerRepository(db, ctx)
  const contractsRepo = contractRepository(db, ctx)

  const [customerRows, contractRows, paymentRows] = await Promise.all([
    customers.list(),
    contractsRepo.list(),
    contractsRepo.payments.list(),
  ])

  /*
   * Les encaissements sont d'abord ramenés au CONTRAT, puis le contrat au client.
   *
   * Deux étapes plutôt qu'une, parce que `contract_payments` ne porte pas de
   * `customer_id` — et ne doit pas en porter : un paiement se rattache à ce qu'il
   * règle, pas à qui l'a réglé. Le conducteur additionnel paie parfois pour le
   * titulaire, et une colonne dénormalisée mentirait ce jour-là.
   */
  const paidByContract = new Map<string, number>()
  for (const payment of paymentRows) {
    paidByContract.set(
      payment.contractId,
      (paidByContract.get(payment.contractId) ?? 0) + payment.amountCents,
    )
  }

  const byCustomer = new Map<
    string,
    { billedCents: number; paidCents: number; contracts: number; lastOn: string | null }
  >()

  for (const contract of contractRows) {
    if (NON_BILLABLE.has(contract.status)) continue

    const known = byCustomer.get(contract.customerId) ?? {
      billedCents: 0,
      paidCents: 0,
      contracts: 0,
      lastOn: null,
    }

    const endOn = contract.plannedEndAt.slice(0, 10)
    byCustomer.set(contract.customerId, {
      billedCents: known.billedCents + contract.totalCents,
      paidCents: known.paidCents + (paidByContract.get(contract.id) ?? 0),
      contracts: known.contracts + 1,
      // La location la plus RÉCENTE : c'est elle qu'on cite au téléphone quand on
      // rappelle un client pour un impayé.
      lastOn: known.lastOn === null || endOn > known.lastOn ? endOn : known.lastOn,
    })
  }

  const rows: CustomerLedger[] = []
  let billedCents = 0
  let paidCents = 0
  let outstandingCents = 0
  let outstandingCustomers = 0

  for (const customer of customerRows) {
    const totals = byCustomer.get(customer.id)
    if (!totals) continue

    /*
     * Le solde est BORNÉ À ZÉRO côté créance.
     *
     * Un trop-perçu — une caution encaissée en avance, un arrondi — donnerait un solde
     * négatif qui viendrait, en s'additionnant, effacer la dette d'un autre client. Le
     * total des impayés doit rester la somme de ce qu'on peut réellement aller
     * chercher, client par client.
     */
    const balance = Math.max(0, totals.billedCents - totals.paidCents)

    billedCents += totals.billedCents
    paidCents += totals.paidCents
    if (balance > 0) {
      outstandingCents += balance
      outstandingCustomers += 1
    }

    rows.push({
      id: customer.id,
      label: customers.label(customer),
      phone: customer.phone,
      email: customer.email,
      contracts: totals.contracts,
      billedCents: totals.billedCents,
      paidCents: totals.paidCents,
      balanceCents: balance,
      lastRentalOn: totals.lastOn,
    })
  }

  return {
    // Les plus gros débiteurs d'abord : c'est l'ordre dans lequel on passe ses appels.
    rows: rows.sort((a, b) => b.balanceCents - a.balanceCents || a.label.localeCompare(b.label)),
    billedCents,
    paidCents,
    outstandingCents,
    outstandingCustomers,
    payingCustomers: rows.length - outstandingCustomers,
  }
}

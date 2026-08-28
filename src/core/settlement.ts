import { billableDays, DEFAULT_VAT_RATE_BP, priceRental } from './rental'

/**
 * LE DÉCOMPTE DE RETOUR — ce qu'on doit à qui, quand la voiture rentre.
 *
 * C'est le moment le plus délicat du comptoir, et c'était le trou du produit : la
 * fiche contrat demandait à l'agent de SAISIR un montant retenu sur la caution, sans
 * jamais lui dire combien retenir. Trois calculs se faisaient donc de tête, devant le
 * client, en fin de journée :
 *
 *  1. combien de jours en plus si la voiture rentre avec deux jours de retard ;
 *  2. combien il reste à payer une fois les acomptes déduits ;
 *  3. ce que la caution couvre, et ce qu'il reste à rendre.
 *
 * Fait de tête, le troisième se trompe dans le sens qui fâche : on rend la caution
 * entière ET on oublie de facturer les jours de retard. Ce module fait ces trois
 * calculs, et l'écran les MONTRE ligne à ligne — un décompte qu'on peut tourner vers
 * le client est aussi un décompte qu'on peut contester, ce qui est exactement le but.
 *
 * Module PUR : ni base, ni horloge, ni React. Le retour d'une voiture engage de
 * l'argent réel ; ce qui décide combien doit être éprouvable à froid, ligne à ligne.
 *
 * Tout est en CENTIMES ENTIERS, de bout en bout, et la TVA est arrondie une seule fois
 * — par `priceRental`, qui reste la seule autorité sur le prix d'une location.
 */

export interface SettlementInput {
  /** Départ RÉEL si connu, sinon le prévu. Instants ISO UTC. */
  startAt: string
  plannedEndAt: string
  /** Retour réel — l'instant où les clés reviennent. */
  actualEndAt: string

  dailyCents: number
  /** `contracts.days_billed`, c'est-à-dire ce qui a été facturé au départ. */
  daysAlreadyBilled: number
  discountCents: number
  /** Extras DÉJÀ portés au contrat avant le retour : siège bébé, GPS, conducteur additionnel. */
  baseExtrasCents: number

  /** Remise à niveau du carburant. Saisi au comptoir — voir la note plus bas. */
  fuelChargeCents: number
  /** Dommages constatés à l'état des lieux de retour, ou toute autre retenue. */
  damageChargeCents: number

  vatRateBp?: number

  depositCents: number
  /** Somme des encaissements déjà enregistrés sur ce contrat. */
  paidCents: number

  startFuelEighths: number | null
  endFuelEighths: number
  startKm: number | null
  endKm: number
}

export interface Settlement {
  /** Jours finalement facturés — au moins ceux du contrat d'origine. */
  daysBilled: number
  /** Jours facturés EN PLUS du contrat d'origine. Zéro si la voiture rentre à l'heure. */
  lateDays: number
  lateChargeCents: number

  /** Huitièmes manquants dans le réservoir. Zéro si la voiture rentre au moins aussi pleine. */
  fuelShortfallEighths: number
  fuelChargeCents: number
  damageChargeCents: number

  /** Total des extras à écrire sur le contrat : ceux d'origine + carburant + dommages. */
  extrasCents: number
  subtotalCents: number
  vatCents: number
  totalCents: number

  paidCents: number
  /** `> 0` : le client doit. `< 0` : l'agence doit. */
  balanceCents: number

  depositCents: number
  /** Ce que le calcul PROPOSE de retenir. L'agent peut le remplacer. */
  suggestedWithheldCents: number
  /** Ce qui est effectivement retenu — la proposition, ou le choix de l'agent, borné. */
  depositWithheldCents: number
  /** Ce qui revient au client sur sa caution. */
  depositDueBackCents: number

  /** Ce qu'il reste à encaisser une fois la caution imputée. */
  remainingToCollectCents: number
  /** Ce que l'agence doit rembourser en plus de la caution — un trop-perçu. */
  refundDueCents: number

  kmDriven: number | null
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * Le décompte.
 *
 * **Un retour ANTICIPÉ ne réduit pas la facture, un retour TARDIF l'augmente.** C'est
 * la décision la moins évidente de ce fichier, et elle est délibérée : recalculer
 * bêtement sur les dates réelles rembourserait le client qui rend sa voiture un jour
 * plus tôt, ce qu'aucun loueur ne fait et ce que le gérant découvrirait sur sa
 * trésorerie plutôt que dans une note. Les jours facturés ne descendent donc jamais
 * sous ceux du contrat signé — `Math.max` ci-dessous —, et c'est la seule ligne à
 * changer le jour où l'agence décide autrement.
 *
 * `withheldOverrideCents` permet à l'agent de décider autre chose que la proposition :
 * retenir la caution entière parce qu'une amende va tomber, ou ne rien retenir par
 * geste commercial. La valeur est BORNÉE à la caution — on ne peut pas retenir plus
 * qu'on ne détient, et c'est le serveur qui le garantit, pas l'écran.
 */
export function settleReturn(
  input: SettlementInput,
  withheldOverrideCents?: number,
): Settlement {
  const vatRateBp = input.vatRateBp ?? DEFAULT_VAT_RATE_BP

  /*
   * Les jours réellement dus : jamais moins que ce qui a été signé.
   * `billableDays` compte des jours ENTAMÉS — deux heures de retard font un jour de
   * plus, ce qui est l'usage et ce que le client comprend.
   */
  const daysOnActual = billableDays(input.startAt, input.actualEndAt)
  const daysBilled = Math.max(input.daysAlreadyBilled, daysOnActual)
  const lateDays = Math.max(0, daysBilled - input.daysAlreadyBilled)

  const fuelShortfallEighths =
    input.startFuelEighths === null
      ? 0
      : Math.max(0, input.startFuelEighths - input.endFuelEighths)

  const fuelChargeCents = Math.max(0, input.fuelChargeCents)
  const damageChargeCents = Math.max(0, input.damageChargeCents)
  const extrasCents = input.baseExtrasCents + fuelChargeCents + damageChargeCents

  /*
   * Le prix repasse par `priceRental` plutôt que d'être recomposé ici.
   *
   * C'est lui qui décide de l'ordre des opérations — remise avant TVA, arrondi unique
   * à la fin — et deux façons de calculer un total finiraient par en donner deux.
   * On lui fournit un `endAt` SYNTHÉTIQUE, calé sur le nombre de jours retenu
   * ci-dessus, pour que le retour anticipé ne rabote pas la facture.
   */
  const syntheticEndAt = new Date(
    Date.parse(input.startAt) + daysBilled * 86_400_000,
  ).toISOString()

  const priced = priceRental({
    startAt: input.startAt,
    endAt: syntheticEndAt,
    dailyCents: input.dailyCents,
    discountCents: input.discountCents,
    extrasCents,
    vatRateBp,
  })

  const balanceCents = priced.totalCents - input.paidCents

  /*
   * LA CAUTION COUVRE CE QUI RESTE DÛ, et rien de plus.
   *
   * Elle n'est pas un acompte : elle ne se retient que s'il reste effectivement
   * quelque chose à payer. Un solde nul ou négatif rend la caution entière — c'est le
   * cas le plus fréquent, et c'est celui qu'on ne veut surtout pas rater.
   */
  const suggestedWithheldCents = clamp(balanceCents, 0, input.depositCents)
  const depositWithheldCents =
    withheldOverrideCents === undefined
      ? suggestedWithheldCents
      : clamp(Math.round(withheldOverrideCents), 0, input.depositCents)

  return {
    daysBilled: priced.daysBilled,
    lateDays,
    lateChargeCents: lateDays * input.dailyCents,

    fuelShortfallEighths,
    fuelChargeCents,
    damageChargeCents,

    extrasCents,
    subtotalCents: priced.subtotalCents,
    vatCents: priced.vatCents,
    totalCents: priced.totalCents,

    paidCents: input.paidCents,
    balanceCents,

    depositCents: input.depositCents,
    suggestedWithheldCents,
    depositWithheldCents,
    depositDueBackCents: input.depositCents - depositWithheldCents,

    remainingToCollectCents: Math.max(0, balanceCents - depositWithheldCents),
    refundDueCents: Math.max(0, -balanceCents),

    kmDriven: input.startKm === null ? null : Math.max(0, input.endKm - input.startKm),
  }
}

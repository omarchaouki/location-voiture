import { z } from 'zod'

/**
 * Schémas partagés client / serveur pour les clients et les contrats.
 * La validation qui compte est celle du serveur.
 */

const civilDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'date.invalid' })
const instant = z.string().min(10)
const cents = z.int().min(0).max(1_000_000_00)

export const CUSTOMER_KINDS = ['individual', 'company'] as const
export const ID_TYPES = ['cin', 'passport', 'carte_sejour'] as const
export const DEPOSIT_METHODS = ['cash', 'cheque', 'card_imprint', 'transfer'] as const
export const PAYMENT_METHODS = ['cash', 'cheque', 'card', 'transfer'] as const

/* ------------------------------------------------------------------- clients */

export const CreateCustomerInput = z
  .object({
    kind: z.enum(CUSTOMER_KINDS).default('individual'),
    firstName: z.string().trim().max(60).optional(),
    lastName: z.string().trim().max(60).optional(),
    companyName: z.string().trim().max(120).optional(),

    idType: z.enum(ID_TYPES).optional(),
    idNumber: z.string().trim().max(40).optional(),

    licenceNumber: z.string().trim().max(40).optional(),
    licenceIssuedOn: civilDate.optional(),
    /** Bloquant à la signature une fois dépassée (docs/DOMAIN.md invariant 5). */
    licenceExpiresOn: civilDate.optional(),
    licenceCountry: z.string().trim().length(2).default('MA'),

    nationality: z.string().trim().max(40).optional(),
    birthOn: civilDate.optional(),
    phone: z.string().trim().max(30).optional(),
    email: z.email().optional(),
    address: z.string().trim().max(200).optional(),
    city: z.string().trim().max(60).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  // Un particulier a un nom, une société a une raison sociale. Sans cela, on
  // enregistrerait des clients sans identité affichable.
  .refine(
    (value) =>
      value.kind === 'company'
        ? Boolean(value.companyName)
        : Boolean(value.firstName ?? value.lastName),
    { message: 'customer.nameRequired', path: ['lastName'] },
  )

/**
 * Correction d'un client.
 *
 * Elle couvrait SIX champs sur douze : ni la nature (particulier / société), ni le
 * type de pièce, ni l'adresse. Autrement dit, trois des champs proposés à la saisie
 * n'avaient aucun chemin de correction — une société enregistrée par erreur en
 * particulier restait un particulier. Elle couvre désormais tout ce que le formulaire
 * demande.
 *
 * L'invariant « un client a une identité affichable » (docs/DOMAIN.md) n'est PAS
 * exprimable ici : chaque champ est facultatif, et un `refine` sur des valeurs
 * partielles ne sait pas ce que vaut le champ qu'on ne renvoie pas. Il est donc
 * vérifié dans `updateCustomer`, après fusion avec la ligne existante — au seul
 * endroit où l'on connaît l'état final.
 */
export const UpdateCustomerInput = z.object({
  id: z.string().min(1),
  kind: z.enum(CUSTOMER_KINDS).optional(),
  firstName: z.string().trim().max(60).optional(),
  lastName: z.string().trim().max(60).optional(),
  companyName: z.string().trim().max(120).optional(),
  idType: z.enum(ID_TYPES).optional(),
  idNumber: z.string().trim().max(40).optional(),
  licenceNumber: z.string().trim().max(40).optional(),
  licenceExpiresOn: civilDate.optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.email().optional(),
  city: z.string().trim().max(60).optional(),
  address: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(2000).optional(),
})

export const BlacklistCustomerInput = z.object({
  id: z.string().min(1),
  blacklisted: z.boolean(),
  reason: z.string().trim().max(200).optional(),
})

export const CustomerIdInput = z.object({ id: z.string().min(1) })

/* ------------------------------------------------------------------ contrats */

export const CreateContractInput = z.object({
  vehicleId: z.string().min(1),
  customerId: z.string().min(1),
  additionalDriverCustomerId: z.string().min(1).optional(),
  plannedStartAt: instant,
  plannedEndAt: instant,
  /** Laissé vide, le tarif du véhicule s'applique. */
  dailyCents: cents.optional(),
  discountCents: cents.optional(),
  extrasCents: cents.optional(),
  depositCents: cents.optional(),
  depositMethod: z.enum(DEPOSIT_METHODS).optional(),
  /**
   * Dérogation à un blocage (permis expiré, liste noire). Réservée à owner/manager,
   * exige un motif, et part dans `audit_log`.
   */
  override: z.string().trim().min(5).max(200).optional(),
})

export const ContractIdInput = z.object({ id: z.string().min(1) })

/** Départ : on relève le compteur et la jauge, c'est ce que fait un agent. */
/**
 * CORRECTION D'UN CONTRAT.
 *
 * Elle ne touche QUE ce qui se corrige : les dates prévues, le tarif, la remise, les
 * extras et la caution. Le véhicule et le client n'y sont pas, et ce n'est pas un
 * oubli — les changer ferait d'un contrat signé un autre contrat, avec la même
 * référence et le même historique de paiements. Se tromper de voiture ou de client
 * s'annule et se ressaisit.
 *
 * Ce que l'ÉTAT autorise est vérifié côté serveur, pas ici : un schéma ne connaît pas
 * la ligne qu'il valide (voir `updateContract`).
 */
export const UpdateContractInput = z.object({
  id: z.string().min(1),
  plannedStartAt: instant.optional(),
  plannedEndAt: instant.optional(),
  dailyCents: cents.optional(),
  discountCents: cents.optional(),
  extrasCents: cents.optional(),
  depositCents: cents.optional(),
})

export const StartContractInput = z.object({
  id: z.string().min(1),
  startKm: z.int().min(0).max(3_000_000),
  /** Carburant en HUITIÈMES : c'est ce que lit une jauge. */
  startFuelEighths: z.int().min(0).max(8),
})

/**
 * LE RETOUR — des CONSTATS, pas des totaux.
 *
 * Ce que l'écran envoie ici, ce sont des relevés de comptoir : le compteur, la jauge,
 * les frais constatés. Les totaux — jours de retard, solde, imputation de la caution —
 * sont recalculés PAR LE SERVEUR (`settleReturn`), jamais reçus.
 *
 * La distinction n'est pas théorique : un client de l'API qui pourrait poster un
 * `totalCents` choisirait le prix de sa location. Le seul montant que l'agent décide
 * vraiment est `depositWithheldCents`, et il est borné à la caution réellement
 * détenue — côté serveur, pas côté écran.
 */
export const ReturnContractInput = z.object({
  id: z.string().min(1),
  endKm: z.int().min(0).max(3_000_000),
  endFuelEighths: z.int().min(0).max(8),

  /**
   * Remise à niveau du carburant, en centimes.
   *
   * Saisi plutôt que calculé, et c'est un manque assumé : le modèle ne porte aujourd'hui
   * ni prix du carburant, ni capacité de réservoir, et les inventer donnerait un montant
   * faux avec l'autorité d'un calcul. L'écran affiche les huitièmes manquants — le
   * constat — et laisse l'agent poser le montant qu'il applique réellement.
   */
  fuelChargeCents: cents.optional(),
  /** Dommages constatés au retour, ou toute autre retenue justifiée. */
  damageChargeCents: cents.optional(),

  /**
   * Montant retenu sur la caution. Omis = on retient ce que le décompte propose,
   * c'est-à-dire juste ce qu'il faut pour solder ce qui reste dû.
   */
  depositWithheldCents: cents.optional(),

  /**
   * La caution a-t-elle été RENDUE au client, physiquement, maintenant ?
   *
   * Ce n'est pas la même question que « combien retient-on » — et les confondre était
   * le défaut de la version précédente, où l'on pouvait cocher « caution rendue » tout
   * en retenant 500 dirhams. Un chèque de caution se déchire au comptoir ; une
   * empreinte de carte se libère plus tard, parfois le lendemain. Tant que la case
   * n'est pas cochée, `deposit_returned_at` reste vide et l'alerte
   * « caution non restituée » se déclenche 48 h après le retour.
   */
  returnDeposit: z.boolean().default(true),
})

export const CancelContractInput = z.object({
  id: z.string().min(1),
  reason: z.string().trim().min(3).max(200),
})

export const RecordPaymentInput = z.object({
  contractId: z.string().min(1),
  amountCents: cents.min(1),
  method: z.enum(PAYMENT_METHODS).default('cash'),
  note: z.string().trim().max(200).optional(),
})

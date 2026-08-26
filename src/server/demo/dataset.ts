import { addCivilDays, addCivilMonths, type CivilDate } from '~/core/dates'

/**
 * LE JEU DE DONNÉES DE DÉMONSTRATION.
 *
 * Module PUR : il ne touche ni la base ni l'horloge. Il reçoit une date de référence
 * et rend une agence entière, prête à écrire. C'est ce qui le rend rejouable et
 * testable — et c'est ce qui rend la réinitialisation nocturne fiable.
 *
 * Deux principes, et ils tirent dans des directions opposées :
 *
 *  1. **Déterministe.** Aucun `Math.random()`. Deux réinitialisations produisent la
 *     même agence, aux mêmes plaques, aux mêmes montants. Une démo qui change de
 *     contenu à chaque visite empêche de dire « regardez la ligne du haut ».
 *  2. **Vivante.** Toutes les dates sont RELATIVES au jour de référence : une police
 *     d'assurance qui expire dans douze jours, un contrat qui se termine demain, un
 *     retour en retard de six heures. Un jeu de données à dates fixes est mort le
 *     lendemain de sa rédaction — et une démo dont toutes les alertes sont périmées
 *     ne montre pas le produit, elle montre une panne.
 *
 * Le contenu est marocain, pas générique : plaques au bon format, marques réellement
 * louées à Casablanca, prénoms et villes d'ici. Une démo peuplée de « John Doe » et de
 * « BMW Série 7 » ne ressemble pas au métier qu'elle prétend outiller.
 */

export interface DemoVehicle {
  plate: string
  make: string
  model: string
  year: number
  category: string
  fuel: string
  gearbox: string
  currentKm: number
  dailyCents: number
  depositCents: number
  status: string
}

export interface DemoCustomer {
  firstName: string
  lastName: string
  phone: string
  city: string
  licenceNumber: string
  /** Décalage en jours par rapport à aujourd'hui. Négatif = permis expiré. */
  licenceExpiresInDays: number
}

export interface DemoContract {
  vehicleIndex: number
  customerIndex: number
  /** Décalages en jours ; les heures sont posées par l'écrivain. */
  startsInDays: number
  endsInDays: number
  status: string
  dailyCents: number
  depositCents: number
  /** Retour réel, en jours. `null` = contrat encore ouvert. */
  returnedInDays: number | null
}

export interface DemoDocuments {
  vehicleIndex: number
  insuranceExpiresInDays: number
  inspectionExpiresInDays: number
  roadTaxPaid: boolean
}

export interface DemoDataset {
  today: CivilDate
  vehicles: DemoVehicle[]
  customers: DemoCustomer[]
  contracts: DemoContract[]
  documents: DemoDocuments[]
  maintenance: Array<{ vehicleIndex: number; kind: string; intervalKm: number; lastDoneKm: number }>
  fines: Array<{ vehicleIndex: number; occurredInDays: number; amountCents: number; reason: string }>
  devices: Array<{ vehicleIndex: number; externalId: string }>
}

/**
 * La flotte : douze voitures, celles qu'on loue vraiment au Maroc.
 *
 * Douze et non trois : une flotte de trois voitures ne montre ni la liste, ni les
 * échéances qui s'empilent, ni l'intérêt d'une carte. Douze tient sur un écran et
 * suffit à faire exister le produit.
 */
const FLEET: ReadonlyArray<Omit<DemoVehicle, 'plate'>> = [
  { make: 'Dacia', model: 'Logan', year: 2023, category: 'berline', fuel: 'diesel', gearbox: 'manuelle', currentKm: 91_340, dailyCents: 25_000, depositCents: 300_000, status: 'available' },
  { make: 'Dacia', model: 'Sandero', year: 2024, category: 'citadine', fuel: 'diesel', gearbox: 'manuelle', currentKm: 42_180, dailyCents: 22_000, depositCents: 300_000, status: 'rented' },
  { make: 'Renault', model: 'Clio', year: 2023, category: 'citadine', fuel: 'essence', gearbox: 'manuelle', currentKm: 68_520, dailyCents: 24_000, depositCents: 300_000, status: 'rented' },
  { make: 'Hyundai', model: 'i10', year: 2022, category: 'citadine', fuel: 'essence', gearbox: 'manuelle', currentKm: 112_900, dailyCents: 20_000, depositCents: 250_000, status: 'available' },
  { make: 'Peugeot', model: '208', year: 2024, category: 'citadine', fuel: 'diesel', gearbox: 'automatique', currentKm: 21_450, dailyCents: 32_000, depositCents: 400_000, status: 'available' },
  { make: 'Volkswagen', model: 'Polo', year: 2023, category: 'citadine', fuel: 'essence', gearbox: 'automatique', currentKm: 55_700, dailyCents: 33_000, depositCents: 400_000, status: 'rented' },
  { make: 'Dacia', model: 'Duster', year: 2023, category: 'suv', fuel: 'diesel', gearbox: 'manuelle', currentKm: 78_300, dailyCents: 38_000, depositCents: 500_000, status: 'available' },
  { make: 'Hyundai', model: 'Tucson', year: 2024, category: 'suv', fuel: 'diesel', gearbox: 'automatique', currentKm: 33_920, dailyCents: 55_000, depositCents: 700_000, status: 'maintenance' },
  { make: 'Fiat', model: 'Doblo', year: 2021, category: 'utilitaire', fuel: 'diesel', gearbox: 'manuelle', currentKm: 148_600, dailyCents: 28_000, depositCents: 350_000, status: 'available' },
  { make: 'Kia', model: 'Picanto', year: 2023, category: 'citadine', fuel: 'essence', gearbox: 'manuelle', currentKm: 61_240, dailyCents: 21_000, depositCents: 250_000, status: 'available' },
  { make: 'Mercedes-Benz', model: 'Classe C', year: 2023, category: 'premium', fuel: 'diesel', gearbox: 'automatique', currentKm: 44_800, dailyCents: 95_000, depositCents: 1_500_000, status: 'available' },
  { make: 'Toyota', model: 'Yaris', year: 2022, category: 'citadine', fuel: 'hybride', gearbox: 'automatique', currentKm: 87_150, dailyCents: 30_000, depositCents: 350_000, status: 'out_of_service' },
]

/** Lettres de série marocaines, dans l'ordre d'usage. */
const PLATE_LETTERS = ['أ', 'ب', 'د', 'ه', 'و'] as const
/** Codes de région : 1 Rabat, 6 Casablanca, 12 Marrakech, 20 Agadir. */
const PLATE_REGIONS = [6, 1, 12, 20] as const

/**
 * Plaque marocaine déterministe : `NNNNN | lettre | région`.
 *
 * Le numéro de série part d'une base fixe et progresse par pas irrégulier — des
 * plaques consécutives (10001, 10002, …) trahiraient immédiatement un jeu de test.
 */
function plateFor(index: number): string {
  const serial = 10_284 + index * 1_637
  const letter = PLATE_LETTERS[index % PLATE_LETTERS.length]
  const region = PLATE_REGIONS[index % PLATE_REGIONS.length]
  return `${serial} | ${letter} | ${region}`
}

const CUSTOMERS: ReadonlyArray<Omit<DemoCustomer, 'licenceExpiresInDays'>> = [
  { firstName: 'Youssef', lastName: 'El Amrani', phone: '0661-234567', city: 'Casablanca', licenceNumber: 'C-482913' },
  { firstName: 'Fatima Zahra', lastName: 'Bennani', phone: '0662-887410', city: 'Rabat', licenceNumber: 'R-193044' },
  { firstName: 'Mehdi', lastName: 'Ouazzani', phone: '0663-551209', city: 'Marrakech', licenceNumber: 'M-720815' },
  { firstName: 'Salma', lastName: 'Idrissi', phone: '0664-990132', city: 'Casablanca', licenceNumber: 'C-336728' },
  { firstName: 'Karim', lastName: 'Tazi', phone: '0665-118273', city: 'Agadir', licenceNumber: 'A-905511' },
  { firstName: 'Nadia', lastName: 'Cherkaoui', phone: '0666-443890', city: 'Fès', licenceNumber: 'F-661204' },
  { firstName: 'Rachid', lastName: 'Benjelloun', phone: '0667-207755', city: 'Tanger', licenceNumber: 'T-118902' },
  { firstName: 'Imane', lastName: 'Alaoui', phone: '0668-334128', city: 'Casablanca', licenceNumber: 'C-559043' },
]

/**
 * Compose l'agence à une date donnée.
 *
 * Les décalages ci-dessous ne sont pas décoratifs : ils sont choisis pour que le
 * moteur d'alertes ait quelque chose à dire dans CHAQUE catégorie, le jour de la
 * démonstration. Une démo où le centre de notifications est vide ne montre pas le
 * produit le plus utile du logiciel.
 */
export function buildDemoDataset(today: CivilDate): DemoDataset {
  return {
    today,

    vehicles: FLEET.map((vehicle, index) => ({ ...vehicle, plate: plateFor(index) })),

    customers: CUSTOMERS.map((customer, index) => ({
      ...customer,
      // Un permis expiré (le troisième) : c'est le blocage à la signature, et il faut
      // pouvoir le montrer.
      licenceExpiresInDays: index === 2 ? -18 : 120 + index * 95,
    })),

    documents: FLEET.map((_, index) => ({
      vehicleIndex: index,
      /*
       * Assurance : une expirée, une à J-3, une à J-12, une à J-26 — de quoi peupler
       * tous les seuils du moteur (30, 14, 7, 1, dépassé). Le reste est lointain.
       */
      insuranceExpiresInDays: [-4, 3, 12, 26, 210, 240, 260, 280, 300, 320, 340, 360][index] ?? 300,
      inspectionExpiresInDays: [45, -9, 120, 8, 190, 260, 275, 290, 310, 330, 350, 365][index] ?? 300,
      // Deux vignettes impayées : la campagne annuelle doit avoir de la matière.
      roadTaxPaid: index !== 1 && index !== 7,
    })),

    contracts: [
      // En cours, se termine demain : l'alerte « fin de contrat » se déclenche.
      { vehicleIndex: 1, customerIndex: 0, startsInDays: -4, endsInDays: 1, status: 'active', dailyCents: 22_000, depositCents: 300_000, returnedInDays: null },
      // EN RETARD de six heures : `contract.late` est calculé, jamais saisi.
      { vehicleIndex: 2, customerIndex: 1, startsInDays: -9, endsInDays: -1, status: 'active', dailyCents: 24_000, depositCents: 300_000, returnedInDays: null },
      // En cours, tranquille.
      { vehicleIndex: 5, customerIndex: 3, startsInDays: -2, endsInDays: 5, status: 'active', dailyCents: 33_000, depositCents: 400_000, returnedInDays: null },
      // Rendu il y a trois jours, caution NON restituée : `deposit.pending` à 48 h.
      { vehicleIndex: 0, customerIndex: 4, startsInDays: -12, endsInDays: -3, status: 'returned', dailyCents: 25_000, depositCents: 300_000, returnedInDays: -3 },
      // Historique, tout est clos.
      { vehicleIndex: 3, customerIndex: 5, startsInDays: -40, endsInDays: -33, status: 'returned', dailyCents: 20_000, depositCents: 250_000, returnedInDays: -33 },
      { vehicleIndex: 6, customerIndex: 6, startsInDays: -25, endsInDays: -18, status: 'returned', dailyCents: 38_000, depositCents: 500_000, returnedInDays: -18 },
      // Réservation à venir : la liste des départs du jour a de la matière demain.
      { vehicleIndex: 4, customerIndex: 7, startsInDays: 2, endsInDays: 9, status: 'reservation', dailyCents: 32_000, depositCents: 400_000, returnedInDays: null },
    ],

    maintenance: [
      // Vidange à 500 km : l'alerte kilométrique est au seuil, pas au hasard.
      { vehicleIndex: 0, kind: 'oil_change', intervalKm: 10_000, lastDoneKm: 81_840 },
      { vehicleIndex: 3, kind: 'oil_change', intervalKm: 10_000, lastDoneKm: 103_400 },
      { vehicleIndex: 8, kind: 'brakes', intervalKm: 40_000, lastDoneKm: 110_000 },
      { vehicleIndex: 7, kind: 'general_service', intervalKm: 20_000, lastDoneKm: 20_100 },
    ],

    fines: [
      // Une amende pendant un contrat : elle se rattache toute seule au conducteur.
      { vehicleIndex: 2, occurredInDays: -5, amountCents: 70_000, reason: 'excès de vitesse' },
      // Une amende hors contrat : elle reste orpheline, et l'écran doit le dire.
      { vehicleIndex: 9, occurredInDays: -11, amountCents: 30_000, reason: 'stationnement' },
    ],

    devices: [
      { vehicleIndex: 0, externalId: 'DEMO-IMEI-0001' },
      { vehicleIndex: 1, externalId: 'DEMO-IMEI-0002' },
      { vehicleIndex: 2, externalId: 'DEMO-IMEI-0003' },
      { vehicleIndex: 5, externalId: 'DEMO-IMEI-0004' },
      { vehicleIndex: 6, externalId: 'DEMO-IMEI-0005' },
    ],
  }
}

/** Décalage en jours → date civile. Une seule définition, pour tout le jeu. */
export function dayOffset(today: CivilDate, days: number): CivilDate {
  return addCivilDays(today, days)
}

/** Décalage en jours → instant ISO, à une heure ouvrable plausible. */
export function instantOffset(today: CivilDate, days: number, hour = 10): string {
  return `${addCivilDays(today, days)}T${String(hour).padStart(2, '0')}:00:00.000Z`
}

/** Échéance d'entretien : la date, quand l'intervalle est en mois. */
export function monthsFrom(today: CivilDate, months: number): CivilDate {
  return addCivilMonths(today, months)
}

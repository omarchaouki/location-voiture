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
  /**
   * Restitution de la caution, en jours. `null` = pas encore rendue.
   *
   * Ce champ existe à cause de la mise à l'échelle. Le seul jeu écrit à la main laisse
   * toutes ses cautions en attente — trois lignes, dont une posée exprès pour faire
   * vivre l'alerte `deposit.pending` à 48 h. Mais quatre-vingt-dix contrats clos qui
   * gardent tous leur caution, ce n'est plus une alerte : c'est une agence qui n'a
   * jamais rendu un dirham, et un centre de notifications où le reste devient
   * invisible. Un historique rend ses cautions.
   */
  depositReturnedInDays: number | null
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
 * VOLUME du jeu, et rien d'autre.
 *
 * Les deux espaces partagés gardent leur taille d'origine — douze voitures, huit
 * clients, aucun historique — parce qu'une démonstration se regarde sur un écran.
 * Mais un compte d'essai qu'on veut éprouver a besoin du contraire : assez de lignes
 * pour que la pagination, le tri, les totaux et les temps de réponse veuillent dire
 * quelque chose.
 *
 * **Le défaut reproduit exactement l'ancien comportement.** C'est la condition pour
 * que la réinitialisation nocturne ne change pas de contenu du jour où ce paramètre
 * est apparu : `buildDemoDataset(today)` rend le même jeu qu'avant, à l'octet près.
 */
export interface DemoSize {
  vehicles: number
  customers: number
  /**
   * Contrats CLOS par véhicule, posés dans le passé lointain.
   *
   * Zéro par défaut : sans historique, les seuls contrats sont les sept écrits à la
   * main, ceux qui font vivre les alertes. L'historique ne sert qu'à donner du poids
   * aux listes et aux chiffres du mois.
   */
  historyPerVehicle: number
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

/* ------------------------------------------------------------- mise à l'échelle */

/**
 * Au-delà du jeu écrit à la main, tout est DÉRIVÉ DE L'INDEX.
 *
 * Pas un `Math.random()` de plus qu'avant : la centième cliente porte le même nom à
 * chaque exécution, et deux remplissages du même compte donnent la même agence. C'est
 * ce qui permet de comparer deux captures d'écran, ou de rejouer un bug.
 */
const FIRST_NAMES = [
  'Youssef', 'Fatima Zahra', 'Mehdi', 'Salma', 'Karim', 'Nadia', 'Rachid', 'Imane',
  'Hamza', 'Khadija', 'Othmane', 'Meryem', 'Anas', 'Ghita', 'Reda', 'Sanaa',
  'Ayoub', 'Loubna', 'Ilyas', 'Hajar',
] as const

/**
 * Patronymes de la mise à l'échelle — AUCUN de ceux des huit clients écrits à la main.
 *
 * La séparation n'est pas cosmétique : elle est ce qui garantit l'unicité. Les noms
 * générés sont la grille prénom × patronyme, unique par construction ; si un patronyme
 * du vivier revenait dans la liste écrite à la main, la grille finirait par retomber
 * dessus avec le même prénom. C'est arrivé — quatre doublons sur cent, trouvés par le
 * test et non à l'œil.
 */
const LAST_NAMES = [
  'Berrada', 'Lahlou', 'Sekkat', 'Fassi', 'Kettani', 'Naciri', 'Bouazza',
  'Chraibi', 'Belkacem', 'Hakimi', 'Zniber', 'Rharbi', 'Squalli', 'Mrini', 'Benslimane',
] as const

/** Villes et la lettre de série du permis qui va avec. */
const CITIES: ReadonlyArray<readonly [string, string]> = [
  ['Casablanca', 'C'], ['Rabat', 'R'], ['Marrakech', 'M'], ['Agadir', 'A'],
  ['Fès', 'F'], ['Tanger', 'T'], ['Meknès', 'K'], ['Oujda', 'O'],
  ['Tétouan', 'E'], ['Kénitra', 'N'],
]

/**
 * Statuts des voitures ajoutées par la mise à l'échelle.
 *
 * Jamais `rented` ici : une voiture est marquée louée UNIQUEMENT si un contrat en
 * cours la sort. Une flotte où le statut ne correspond à aucun contrat est le premier
 * détail qui trahit un jeu de test, et le premier qui fait douter de l'écran.
 */
const EXTRA_STATUS = ['available', 'available', 'available', 'available', 'maintenance', 'available', 'available', 'out_of_service'] as const

const FINE_REASONS = ['excès de vitesse', 'stationnement', 'téléphone au volant', 'feu rouge', 'ceinture'] as const

/** Voiture à l'index donné : celles écrites à la main d'abord, dérivées ensuite. */
function vehicleAt(index: number): DemoVehicle {
  const base = FLEET[index % FLEET.length]!
  if (index < FLEET.length) return { ...base, plate: plateFor(index) }

  // `drift` : le rang du tour de flotte. Le deuxième Logan n'est ni de la même année
  // ni au même compteur que le premier.
  const drift = Math.floor(index / FLEET.length)
  return {
    ...base,
    plate: plateFor(index),
    year: Math.max(2017, base.year - drift - (index % 3)),
    currentKm: base.currentKm + drift * 23_400 + (index * 1_811) % 40_000,
    // Les tarifs bougent par pas de 10 MAD : aucun loueur n'affiche 247,30 MAD.
    dailyCents: base.dailyCents + ((index * 3) % 5) * 1_000,
    status: EXTRA_STATUS[index % EXTRA_STATUS.length]!,
  }
}

/** Client à l'index donné. Les paires prénom/nom sont uniques tant que i < 20 × 23. */
function customerAt(index: number): DemoCustomer {
  const crafted = CUSTOMERS[index]
  const [city, letter] = CITIES[index % CITIES.length]!

  if (crafted && index < CUSTOMERS.length) {
    return {
      ...crafted,
      // Un permis expiré (le troisième) : c'est le blocage à la signature, et il faut
      // pouvoir le montrer.
      licenceExpiresInDays: index === 2 ? -18 : 120 + index * 95,
    }
  }

  return {
    firstName: FIRST_NAMES[index % FIRST_NAMES.length]!,
    lastName: LAST_NAMES[Math.floor(index / FIRST_NAMES.length) % LAST_NAMES.length]!,
    phone: `06${String(60 + (index % 39)).padStart(2, '0')}-${String(100_000 + ((index * 7_919) % 900_000)).slice(0, 6)}`,
    city,
    licenceNumber: `${letter}-${100_000 + index * 1_373}`,
    /*
     * Un permis expiré tous les onze clients, un permis qui expire dans le mois tous
     * les treize. Le reste est lointain. Sans ces deux poches, l'écran « permis à
     * surveiller » reste vide quel que soit le volume, et on ne le teste jamais.
     */
    licenceExpiresInDays:
      index % 11 === 0 ? -(3 + (index % 40)) : index % 13 === 0 ? 4 + (index % 25) : 90 + ((index * 37) % 900),
  }
}

/** Échéances documentaires d'une voiture. Les douze premières restent celles écrites à la main. */
function documentAt(index: number): DemoDocuments {
  const insurance = [-4, 3, 12, 26, 210, 240, 260, 280, 300, 320, 340, 360][index]
  const inspection = [45, -9, 120, 8, 190, 260, 275, 290, 310, 330, 350, 365][index]

  if (insurance !== undefined && inspection !== undefined) {
    return {
      vehicleIndex: index,
      insuranceExpiresInDays: insurance,
      inspectionExpiresInDays: inspection,
      // Deux vignettes impayées : la campagne annuelle doit avoir de la matière.
      roadTaxPaid: index !== 1 && index !== 7,
    }
  }

  return {
    vehicleIndex: index,
    // Mêmes poches qu'au-dessus : de l'expiré, de l'imminent, et beaucoup de lointain.
    insuranceExpiresInDays:
      index % 9 === 0 ? -(2 + (index % 21)) : index % 7 === 0 ? 2 + (index % 25) : 60 + ((index * 53) % 300),
    inspectionExpiresInDays:
      index % 10 === 0 ? -(5 + (index % 30)) : index % 8 === 0 ? 3 + (index % 20) : 70 + ((index * 71) % 290),
    roadTaxPaid: index % 6 !== 0,
  }
}

/**
 * L'HISTORIQUE : des contrats clos, dans le passé lointain.
 *
 * Ils commencent à J-50, derrière le plus ancien contrat écrit à la main (J-40), et
 * reculent par pas de 34 jours. Les fenêtres d'un même véhicule ne peuvent donc pas
 * se chevaucher — une voiture louée deux fois le même jour rendrait le rattachement
 * d'une amende ambigu, et ferait mentir le chiffre d'affaires.
 */
function historyContracts(
  vehicles: ReadonlyArray<DemoVehicle>,
  customerCount: number,
  perVehicle: number,
): DemoContract[] {
  const out: DemoContract[] = []

  for (let vehicleIndex = 0; vehicleIndex < vehicles.length; vehicleIndex += 1) {
    const vehicle = vehicles[vehicleIndex]!
    for (let rank = 0; rank < perVehicle; rank += 1) {
      const endsInDays = -50 - rank * 34 - (vehicleIndex % 11)
      const days = 3 + ((vehicleIndex + rank) % 8)
      // Un retour en retard d'un jour sur six : les pénalités doivent exister ailleurs
      // que dans le contrat de démonstration écrit à la main.
      const lateByDays = (vehicleIndex + rank) % 6 === 0 ? 1 : 0

      out.push({
        vehicleIndex,
        customerIndex: (vehicleIndex * 13 + rank * 29) % customerCount,
        startsInDays: endsInDays - days,
        endsInDays,
        status: 'returned',
        dailyCents: vehicle.dailyCents,
        depositCents: vehicle.depositCents,
        returnedInDays: endsInDays + lateByDays,
        // Rendue le jour même du retour. Une agence qui garde quatre-vingt-dix cautions
        // n'existe pas, et la seule alerte `deposit.pending` qui compte est celle que le
        // jeu écrit à la main pose exprès.
        depositReturnedInDays: endsInDays + lateByDays,
      })
    }
  }

  return out
}

/**
 * Ce qui est DEHORS aujourd'hui, au-delà des trois contrats écrits à la main.
 *
 * Uniquement sur les voitures ajoutées par la mise à l'échelle (index ≥ 12) : les
 * douze premières ont déjà leur situation, choisie pour le moteur d'alertes.
 */
function liveContracts(
  vehicles: ReadonlyArray<DemoVehicle>,
  customerCount: number,
): { contracts: DemoContract[]; rented: number[] } {
  const contracts: DemoContract[] = []
  /** Les voitures que ces contrats sortent vraiment — celles à passer en « louée ». */
  const rented: number[] = []

  for (let vehicleIndex = FLEET.length; vehicleIndex < vehicles.length; vehicleIndex += 1) {
    const vehicle = vehicles[vehicleIndex]!
    if (vehicle.status === 'maintenance' || vehicle.status === 'out_of_service') continue

    const customerIndex = (vehicleIndex * 17 + 5) % customerCount

    if (vehicleIndex % 4 === 0) {
      const startsInDays = -1 - (vehicleIndex % 5)
      contracts.push({
        vehicleIndex,
        customerIndex,
        startsInDays,
        endsInDays: startsInDays + 4 + (vehicleIndex % 7),
        status: 'active',
        dailyCents: vehicle.dailyCents,
        depositCents: vehicle.depositCents,
        returnedInDays: null,
        // Contrat encore ouvert : la caution est encaissée, elle ne peut pas être rendue.
        depositReturnedInDays: null,
      })
      rented.push(vehicleIndex)
      continue
    }

    if (vehicleIndex % 7 === 0) {
      const startsInDays = 1 + (vehicleIndex % 9)
      contracts.push({
        vehicleIndex,
        customerIndex,
        startsInDays,
        endsInDays: startsInDays + 3 + (vehicleIndex % 5),
        status: 'reservation',
        dailyCents: vehicle.dailyCents,
        depositCents: vehicle.depositCents,
        returnedInDays: null,
        // Contrat encore ouvert : la caution est encaissée, elle ne peut pas être rendue.
        depositReturnedInDays: null,
      })
      // Une réservation ne sort pas la voiture : elle reste disponible d'ici là.
    }
  }

  return { contracts, rented }
}

/**
 * Compose l'agence à une date donnée.
 *
 * Les décalages ci-dessous ne sont pas décoratifs : ils sont choisis pour que le
 * moteur d'alertes ait quelque chose à dire dans CHAQUE catégorie, le jour de la
 * démonstration. Une démo où le centre de notifications est vide ne montre pas le
 * produit le plus utile du logiciel.
 */
export function buildDemoDataset(
  today: CivilDate,
  size: DemoSize = DEFAULT_DEMO_SIZE,
): DemoDataset {
  const vehicleCount = Math.max(1, Math.trunc(size.vehicles))
  const customerCount = Math.max(1, Math.trunc(size.customers))
  const perVehicle = Math.max(0, Math.trunc(size.historyPerVehicle))

  const vehicles = Array.from({ length: vehicleCount }, (_, index) => vehicleAt(index))
  const customers = Array.from({ length: customerCount }, (_, index) => customerAt(index))

  /*
   * Les entrées écrites à la main désignent des voitures et des clients par leur rang.
   * En dessous de la taille d'origine, ces rangs n'existent pas : on les écarte plutôt
   * que d'écrire un contrat qui pointe dans le vide.
   */
  const fits = (entry: { vehicleIndex: number }) => entry.vehicleIndex < vehicleCount
  const crafted = CRAFTED_CONTRACTS.filter(
    (contract) => fits(contract) && contract.customerIndex < customerCount,
  )

  const live = liveContracts(vehicles, customerCount)
  const history = historyContracts(vehicles, customerCount, perVehicle).sort(
    (left, right) =>
      left.startsInDays - right.startsInDays || left.vehicleIndex - right.vehicleIndex,
  )

  /*
   * Le statut suit le contrat, jamais l'inverse. Une voiture n'est « louée » que si
   * un contrat en cours la sort — c'est la seule façon que la liste des véhicules et
   * celle des contrats racontent la même journée.
   */
  for (const vehicleIndex of live.rented) {
    vehicles[vehicleIndex]!.status = 'rented'
  }

  return {
    today,

    vehicles,
    customers,
    documents: vehicles.map((_, index) => documentAt(index)),

    /*
     * L'ordre fait les références : `nextReference` numérote dans l'ordre du tableau.
     * L'historique d'abord, donc les vieux contrats portent les petits numéros.
     */
    contracts: [...history, ...crafted, ...live.contracts],

    maintenance: [
      ...CRAFTED_MAINTENANCE.filter(fits),
      ...vehicles.flatMap((vehicle, index) =>
        index < FLEET.length || index % 3 !== 0
          ? []
          : [
              {
                vehicleIndex: index,
                kind: index % 6 === 0 ? 'oil_change' : 'brakes',
                intervalKm: index % 6 === 0 ? 10_000 : 40_000,
                // Assez près du compteur pour que l'échéance kilométrique existe.
                lastDoneKm: Math.max(0, vehicle.currentKm - 8_200 - ((index * 311) % 3_000)),
              },
            ],
      ),
    ],

    fines: [
      ...CRAFTED_FINES.filter(fits),
      ...vehicles.flatMap((_, index) =>
        index < FLEET.length || index % 8 !== 0
          ? []
          : [
              {
                vehicleIndex: index,
                occurredInDays: -(4 + ((index * 13) % 70)),
                amountCents: 30_000 + ((index * 7) % 5) * 10_000,
                reason: FINE_REASONS[index % FINE_REASONS.length]!,
              },
            ],
      ),
    ],

    devices: [
      ...CRAFTED_DEVICES.filter(fits),
      ...vehicles.flatMap((_, index) =>
        index < FLEET.length || index % 5 !== 0
          ? []
          : [{ vehicleIndex: index, externalId: `DEMO-IMEI-${String(index + 1).padStart(4, '0')}` }],
      ),
    ],
  }
}

/**
 * La taille d'origine : celle des deux espaces partagés, remis à zéro chaque nuit.
 * Elle est le DÉFAUT, et le restera — voir `DemoSize`.
 */
export const DEFAULT_DEMO_SIZE: DemoSize = {
  vehicles: FLEET.length,
  customers: CUSTOMERS.length,
  historyPerVehicle: 0,
}

/**
 * Les sept contrats écrits à la main.
 *
 * Chacun existe pour faire parler une règle d'alerte précise. Ils passent avant
 * toute mise à l'échelle : quelle que soit la taille demandée, ces sept situations
 * sont dans le jeu.
 */
const CRAFTED_CONTRACTS: ReadonlyArray<DemoContract> = [
  // En cours, se termine demain : l'alerte « fin de contrat » se déclenche.
  { vehicleIndex: 1, customerIndex: 0, startsInDays: -4, endsInDays: 1, status: 'active', dailyCents: 22_000, depositCents: 300_000, returnedInDays: null, depositReturnedInDays: null  },
  // EN RETARD de six heures : `contract.late` est calculé, jamais saisi.
  { vehicleIndex: 2, customerIndex: 1, startsInDays: -9, endsInDays: -1, status: 'active', dailyCents: 24_000, depositCents: 300_000, returnedInDays: null, depositReturnedInDays: null  },
  // En cours, tranquille.
  { vehicleIndex: 5, customerIndex: 3, startsInDays: -2, endsInDays: 5, status: 'active', dailyCents: 33_000, depositCents: 400_000, returnedInDays: null, depositReturnedInDays: null  },
  // Rendu il y a trois jours, caution NON restituée : `deposit.pending` à 48 h.
  { vehicleIndex: 0, customerIndex: 4, startsInDays: -12, endsInDays: -3, status: 'returned', dailyCents: 25_000, depositCents: 300_000, returnedInDays: -3, depositReturnedInDays: null  },
  // Historique, tout est clos.
  { vehicleIndex: 3, customerIndex: 5, startsInDays: -40, endsInDays: -33, status: 'returned', dailyCents: 20_000, depositCents: 250_000, returnedInDays: -33, depositReturnedInDays: null  },
  { vehicleIndex: 6, customerIndex: 6, startsInDays: -25, endsInDays: -18, status: 'returned', dailyCents: 38_000, depositCents: 500_000, returnedInDays: -18, depositReturnedInDays: null  },
  // Réservation à venir : la liste des départs du jour a de la matière demain.
  { vehicleIndex: 4, customerIndex: 7, startsInDays: 2, endsInDays: 9, status: 'reservation', dailyCents: 32_000, depositCents: 400_000, returnedInDays: null, depositReturnedInDays: null  },
]

const CRAFTED_MAINTENANCE: DemoDataset['maintenance'] = [
  // Vidange à 500 km : l'alerte kilométrique est au seuil, pas au hasard.
  { vehicleIndex: 0, kind: 'oil_change', intervalKm: 10_000, lastDoneKm: 81_840 },
  { vehicleIndex: 3, kind: 'oil_change', intervalKm: 10_000, lastDoneKm: 103_400 },
  { vehicleIndex: 8, kind: 'brakes', intervalKm: 40_000, lastDoneKm: 110_000 },
  { vehicleIndex: 7, kind: 'general_service', intervalKm: 20_000, lastDoneKm: 20_100 },
]

const CRAFTED_FINES: DemoDataset['fines'] = [
  // Une amende pendant un contrat : elle se rattache toute seule au conducteur.
  { vehicleIndex: 2, occurredInDays: -5, amountCents: 70_000, reason: 'excès de vitesse' },
  // Une amende hors contrat : elle reste orpheline, et l'écran doit le dire.
  { vehicleIndex: 9, occurredInDays: -11, amountCents: 30_000, reason: 'stationnement' },
]

const CRAFTED_DEVICES: DemoDataset['devices'] = [
  { vehicleIndex: 0, externalId: 'DEMO-IMEI-0001' },
  { vehicleIndex: 1, externalId: 'DEMO-IMEI-0002' },
  { vehicleIndex: 2, externalId: 'DEMO-IMEI-0003' },
  { vehicleIndex: 5, externalId: 'DEMO-IMEI-0004' },
  { vehicleIndex: 6, externalId: 'DEMO-IMEI-0005' },
]

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

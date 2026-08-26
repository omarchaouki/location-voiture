import { addCivilDays, addCivilMonths, civilDaysBetween, type CivilDate } from './dates'

/**
 * LE CARNET — ce qui arrive sur une voiture, et quand.
 *
 * Module pur : ni React, ni Drizzle, ni `Date.now()`. Il reçoit un instantané et une
 * date de référence, il renvoie des lignes de frise. C'est la logique qui décide ce
 * qu'un gérant voit en ouvrant une fiche véhicule, donc c'est elle qu'il faut pouvoir
 * tester à froid.
 *
 * Il ne DÉCIDE pas des alertes (Phase 4) : il décrit un état. Les deux partagent les
 * mêmes règles métier, mais la frise doit rester lisible même quand le moteur
 * d'alertes est à l'arrêt.
 */

export type LogbookKind =
  | 'insurance'
  | 'inspection'
  | 'roadTax'
  | 'permit'
  | 'oilChange'
  | 'contractReturn'
  | 'maintenanceDone'

export interface LogbookEntry {
  id: string
  kind: LogbookKind
  date: CivilDate
  /** Précision de fin de ligne : « 74 210 km », « ~12 j · 800 km ». */
  detail?: string
  state: 'done' | 'upcoming' | 'overdue'
}

export interface LogbookSource {
  today: CivilDate
  currentKm: number
  /** Moyenne quotidienne réelle sur 90 jours. `null` si l'historique manque. */
  dailyKmAverage: number | null

  insurance?: { id: string; expiresOn: CivilDate } | null
  inspection?: { id: string; expiresOn: CivilDate } | null
  /** Vignette : une campagne annuelle, pas une date glissante (docs/DECISIONS.md É3). */
  roadTax?: { id: string; year: number; paidAt: CivilDate | null } | null
  permits?: ReadonlyArray<{ id: string; expiresOn: CivilDate }>

  maintenance?: ReadonlyArray<{
    id: string
    kind: string
    nextDueOn: CivilDate | null
    nextDueKm: number | null
  }>
  maintenanceDone?: ReadonlyArray<{ id: string; performedOn: CivilDate; km: number | null }>
  contracts?: ReadonlyArray<{
    id: string
    reference: string
    endOn: CivilDate
    closed: boolean
  }>
}

/** Fenêtre de paiement de la vignette : janvier. La sortir d'ici serait la perdre. */
const ROAD_TAX_WINDOW_END_DAY = 31

export function buildLogbook(source: LogbookSource): LogbookEntry[] {
  const entries: LogbookEntry[] = []
  const { today } = source

  const expiry = (date: CivilDate): LogbookEntry['state'] =>
    civilDaysBetween(today, date) < 0 ? 'overdue' : 'upcoming'

  if (source.insurance) {
    entries.push({
      id: `insurance:${source.insurance.id}`,
      kind: 'insurance',
      date: source.insurance.expiresOn,
      state: expiry(source.insurance.expiresOn),
    })
  }

  if (source.inspection) {
    entries.push({
      id: `inspection:${source.inspection.id}`,
      kind: 'inspection',
      date: source.inspection.expiresOn,
      state: expiry(source.inspection.expiresOn),
    })
  }

  const roadTax = roadTaxEntry(source)
  if (roadTax) entries.push(roadTax)

  for (const permit of source.permits ?? []) {
    entries.push({
      id: `permit:${permit.id}`,
      kind: 'permit',
      date: permit.expiresOn,
      state: expiry(permit.expiresOn),
    })
  }

  for (const schedule of source.maintenance ?? []) {
    const entry = maintenanceEntry(source, schedule)
    if (entry) entries.push(entry)
  }

  for (const record of source.maintenanceDone ?? []) {
    entries.push({
      id: `done:${record.id}`,
      kind: 'maintenanceDone',
      date: record.performedOn,
      state: 'done',
      ...(record.km === null ? {} : { detail: `${record.km} km` }),
    })
  }

  for (const contract of source.contracts ?? []) {
    entries.push({
      id: `contract:${contract.id}`,
      kind: 'contractReturn',
      date: contract.endOn,
      detail: contract.reference,
      state: contract.closed ? 'done' : expiry(contract.endOn),
    })
  }

  return entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

/**
 * Vignette : due chaque année dans une fenêtre de début d'année.
 *
 * Tant que l'année en cours n'est pas payée, l'échéance est la fin de la fenêtre.
 * Passé cette date, le véhicule est en infraction — un état qui dure jusqu'au
 * paiement, pas un simple retard qui s'efface.
 */
function roadTaxEntry(source: LogbookSource): LogbookEntry | null {
  const roadTax = source.roadTax
  if (!roadTax) return null

  const deadline: CivilDate = `${roadTax.year}-01-${ROAD_TAX_WINDOW_END_DAY}`

  if (roadTax.paidAt) {
    return {
      id: `roadtax:${roadTax.id}`,
      kind: 'roadTax',
      date: roadTax.paidAt,
      detail: String(roadTax.year),
      state: 'done',
    }
  }

  return {
    id: `roadtax:${roadTax.id}`,
    kind: 'roadTax',
    date: deadline,
    detail: String(roadTax.year),
    state: civilDaysBetween(source.today, deadline) < 0 ? 'overdue' : 'upcoming',
  }
}

/**
 * Entretien : l'échéance tombe au PREMIER des deux seuils atteint, kilomètres ou temps.
 *
 * Le kilométrage restant est converti en jours par la moyenne quotidienne réelle du
 * véhicule, pour pouvoir dire « dans ~12 jours » et pas seulement « dans 800 km ».
 * Trois cas limites, tous rencontrés en vrai :
 *  - pas de moyenne (véhicule trop récent) → on n'affiche que les kilomètres ;
 *  - moyenne nulle (véhicule immobilisé) → **jamais de division par zéro**, ni
 *    d'échéance « dans 9999 jours » ;
 *  - une seule des deux bornes renseignée → on utilise celle qui existe.
 */
function maintenanceEntry(
  source: LogbookSource,
  schedule: { id: string; kind: string; nextDueOn: CivilDate | null; nextDueKm: number | null },
): LogbookEntry | null {
  const kmRemaining =
    schedule.nextDueKm === null ? null : schedule.nextDueKm - source.currentKm

  const average = source.dailyKmAverage
  const kmAsDays =
    kmRemaining === null || average === null || average <= 0
      ? null
      : Math.round(kmRemaining / average)

  const dateFromKm = kmAsDays === null ? null : addCivilDays(source.today, kmAsDays)
  const dateFromTime = schedule.nextDueOn

  // Le premier seuil atteint : la plus PROCHE des deux dates.
  const date =
    dateFromKm && dateFromTime ? (dateFromKm < dateFromTime ? dateFromKm : dateFromTime) : (dateFromKm ?? dateFromTime)

  if (!date) return null

  const parts: string[] = []
  if (kmAsDays !== null) parts.push(`~${Math.max(kmAsDays, 0)} j`)
  if (kmRemaining !== null) parts.push(`${Math.max(kmRemaining, 0)} km`)

  return {
    id: `maintenance:${schedule.id}`,
    kind: schedule.kind === 'oil_change' ? 'oilChange' : 'maintenanceDone',
    date,
    state: civilDaysBetween(source.today, date) < 0 ? 'overdue' : 'upcoming',
    ...(parts.length > 0 ? { detail: parts.join(' · ') } : {}),
  }
}

/**
 * Prochaine échéance d'entretien à partir du dernier passage.
 * Utilisé à l'enregistrement d'un entretien pour recalculer `next_due_*`.
 */
export function nextMaintenanceDue(input: {
  performedOn: CivilDate
  km: number | null
  intervalMonths: number | null
  intervalKm: number | null
}): { nextDueOn: CivilDate | null; nextDueKm: number | null } {
  return {
    nextDueOn:
      input.intervalMonths === null ? null : addCivilMonths(input.performedOn, input.intervalMonths),
    nextDueKm: input.intervalKm === null || input.km === null ? null : input.km + input.intervalKm,
  }
}

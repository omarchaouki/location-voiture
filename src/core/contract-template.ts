import { z } from 'zod'

/**
 * LE MODÈLE DE CONTRAT — les clauses que l'agence écrit elle-même.
 *
 * Chaque loueur a SON contrat type. Il vient de son avocat, de son assureur, ou du
 * loueur d'à côté ; il porte ses conditions de kilométrage, sa franchise, sa clause de
 * sortie du territoire. Un produit qui impose ses propres clauses n'est pas utilisable
 * : le gérant continue d'imprimer son contrat sur son ordinateur et de le remplir à la
 * main, et le logiciel ne sert plus qu'à noter les dates.
 *
 * **Pourquoi des BLOCS et pas du HTML libre.** La tentation évidente est un éditeur
 * riche — ProseMirror, TipTap — qui rendrait du HTML stocké tel quel. Trois raisons de
 * ne pas le faire ici, dans l'ordre où elles pèsent :
 *
 *  1. **du HTML en base, c'est une injection en attente.** Il faudrait l'assainir à
 *     l'écriture ET à la lecture, et un assainisseur maison est un pari qu'on perd.
 *     Ici rien n'est rendu en `dangerouslySetInnerHTML` : les blocs deviennent des
 *     éléments React, et un `<script>` tapé dans le champ s'imprime comme du texte ;
 *  2. **cent-quatre-vingts kilo-octets de plus dans le paquet client**, mesurés à
 *     chaque construction par `pnpm check:budget`, pour un écran qu'on ouvre une fois
 *     par an ;
 *  3. **le papier.** Un éditeur libre produit des marges, des tailles et des couleurs
 *     que la feuille de style d'impression devra ensuite défaire. Six formes de bloc
 *     se composent en revanche exactement comme le reste du produit.
 *
 * Le prix de ce choix est réel et assumé : pas de tableaux, pas d'images dans le corps
 * du contrat, pas d'alignement libre. Un contrat de location n'en a pas besoin — il a
 * besoin d'articles numérotés, de paragraphes et de listes.
 */

/* -------------------------------------------------------------------- blocs */

export const BLOCK_KINDS = ['heading', 'paragraph', 'list', 'signatures'] as const
export type BlockKind = (typeof BLOCK_KINDS)[number]

/**
 * Un bloc.
 *
 * `text` porte les lignes : une seule pour un titre ou un paragraphe, une par point
 * pour une liste. Le retour à la ligne est le séparateur — c'est ce qu'on tape
 * naturellement dans un champ multiligne, et cela évite un tableau à gérer à l'écran.
 *
 * `signatures` n'a pas de texte : c'est le pied de page réglementaire — deux cadres à
 * signer, côté loueur et côté locataire. Il est un BLOC et non un ajout automatique
 * pour qu'on puisse le placer où on veut, et surtout pour qu'on puisse le retirer :
 * une agence qui fait signer sur tablette n'en veut pas.
 */
export const TemplateBlock = z.object({
  kind: z.enum(BLOCK_KINDS),
  text: z.string().max(4000).default(''),
})

export type TemplateBlock = z.infer<typeof TemplateBlock>

/** Le modèle entier. Borné : un contrat de trente blocs ne se lit plus. */
export const TemplateBlocks = z.array(TemplateBlock).max(60)

/**
 * Lecture défensive du JSON stocké.
 *
 * Le contenu est sérialisé en `text` (règle 5 de la charte de portabilité) et validé
 * par Zod AU BORD. Un modèle corrompu — migration ratée, écriture manuelle en base —
 * ne doit pas casser l'impression d'un contrat : on retombe sur une liste vide, et
 * l'écran propose alors de repartir du modèle par défaut.
 */
export function parseBlocks(json: string | null): TemplateBlock[] {
  if (!json) return []
  try {
    const parsed = TemplateBlocks.safeParse(JSON.parse(json))
    return parsed.success ? parsed.data : []
  } catch {
    return []
  }
}

/* ---------------------------------------------------------------- variables */

/**
 * LES VARIABLES, écrites `{{agency.name}}` dans le texte.
 *
 * Clés en anglais et stables, comme le reste du code : elles ne sont jamais TAPÉES par
 * l'utilisateur — l'éditeur les insère depuis une liste où chacune porte son libellé
 * traduit. Les écrire en français aurait fait un jeu de clés par langue, donc un modèle
 * qui cesse de se remplir le jour où l'agence passe son contrat en arabe.
 *
 * La liste est FERMÉE. Une variable inconnue reste affichée telle quelle plutôt que de
 * disparaître : un contrat imprimé où « {{client.solvabilité}} » s'est effacé en
 * silence est un contrat où il manque une phrase que personne ne remarquera.
 */
export const TEMPLATE_VARIABLES = [
  'agency.name',
  'agency.city',
  'agency.phone',
  'agency.email',

  'contract.reference',
  'contract.startAt',
  'contract.endAt',
  'contract.days',
  'contract.dailyPrice',
  'contract.total',
  'contract.deposit',

  'customer.name',
  'customer.idNumber',
  'customer.licenceNumber',
  'customer.phone',
  'customer.address',

  'vehicle.plate',
  'vehicle.make',
  'vehicle.model',
  'vehicle.km',
] as const

export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number]

/** Ce que l'écran d'impression fournit. Une valeur manquante vaut la chaîne vide. */
export type VariableValues = Partial<Record<TemplateVariable, string>>

const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z.]+)\s*\}\}/g

/**
 * Remplace les variables par leurs valeurs.
 *
 * Une clé inconnue est LAISSÉE TELLE QUELLE — voir plus haut. Une clé connue mais sans
 * valeur devient une suite de points de conduite : c'est un contrat qu'on complétera au
 * stylo, et un blanc muet ne se voit pas au moment de signer.
 */
export function fillVariables(text: string, values: VariableValues): string {
  return text.replace(VARIABLE_PATTERN, (whole, key: string) => {
    if (!(TEMPLATE_VARIABLES as readonly string[]).includes(key)) return whole
    const value = values[key as TemplateVariable]
    return value === undefined || value === '' ? '……………' : value
  })
}

/* ------------------------------------------------------- mise en forme fine */

export interface TextRun {
  text: string
  bold: boolean
  italic: boolean
}

const INLINE_PATTERN = /(\*\*[^*]+\*\*|__[^_]+__)/g

/**
 * Découpe un texte en fragments gras / normaux.
 *
 * `**gras**` et `__italique__`, et rien d'autre. Deux marques seulement, parce que ce
 * sont les deux dont un contrat a besoin — souligner un article, mettre une réserve en
 * italique — et parce que chaque marque supplémentaire est un bouton de plus dans une
 * barre d'outils que le gérant n'ouvrira que deux fois dans sa vie.
 *
 * Le rendu passe par des éléments React, jamais par `innerHTML` : c'est ce qui rend
 * l'ensemble inoffensif quoi qu'on tape dans le champ.
 */
export function parseRuns(text: string): TextRun[] {
  return text
    .split(INLINE_PATTERN)
    .filter((part) => part.length > 0)
    .map((part) => {
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        return { text: part.slice(2, -2), bold: true, italic: false }
      }
      if (part.startsWith('__') && part.endsWith('__') && part.length > 4) {
        return { text: part.slice(2, -2), bold: false, italic: true }
      }
      return { text: part, bold: false, italic: false }
    })
}

/** Les lignes d'un bloc de liste. Les lignes vides sont écartées, pas rendues. */
export function linesOf(block: TemplateBlock): string[] {
  return block.text.split('\n').map((line) => line.trim()).filter((line) => line.length > 0)
}

/* ------------------------------------------------------- modèle de départ */

/**
 * LE MODÈLE PAR DÉFAUT, dans la langue de l'agence.
 *
 * Ce n'est pas de l'interface : c'est du CONTENU MÉTIER, un point de départ qu'on
 * modifie. Il ne passe donc pas par `t()` — un contrat n'est pas traduit à la volée
 * selon la langue de celui qui le regarde, il est ÉCRIT une fois dans la langue dans
 * laquelle il sera signé, et il reste tel quel.
 *
 * **Ces clauses ne sont pas un avis juridique**, et l'écran le dit. Elles reprennent
 * l'ossature d'un contrat de location de courte durée au Maroc — durée, prix, caution,
 * carburant, usage, restitution — pour qu'une agence n'ait pas à partir d'une page
 * blanche. C'est à elle, et à son conseil, de les arrêter.
 */
export function defaultTemplate(locale: 'fr' | 'ar' | 'en' | 'es'): TemplateBlock[] {
  const source = DEFAULT_TEMPLATES[locale]
  return source.map((block) => ({ ...block }))
}

const DEFAULT_TEMPLATES: Record<'fr' | 'ar' | 'en' | 'es', TemplateBlock[]> = {
  fr: [
    { kind: 'heading', text: 'Contrat de location de véhicule sans chauffeur' },
    {
      kind: 'paragraph',
      text: 'Entre **{{agency.name}}**, dont le siège est à {{agency.city}}, ci-après « le loueur », et **{{customer.name}}**, titulaire de la pièce d’identité n° {{customer.idNumber}} et du permis de conduire n° {{customer.licenceNumber}}, demeurant à {{customer.address}}, ci-après « le locataire ».',
    },
    { kind: 'heading', text: 'Article 1 — Objet' },
    {
      kind: 'paragraph',
      text: 'Le loueur met à disposition du locataire le véhicule immatriculé **{{vehicle.plate}}** ({{vehicle.make}} {{vehicle.model}}), relevé au compteur à {{vehicle.km}} km, du {{contract.startAt}} au {{contract.endAt}}, soit {{contract.days}} jour(s).',
    },
    { kind: 'heading', text: 'Article 2 — Prix et caution' },
    {
      kind: 'paragraph',
      text: 'Le prix de la location est de {{contract.dailyPrice}} par jour, soit **{{contract.total}}** toutes taxes comprises. Une caution de {{contract.deposit}} est remise à la prise du véhicule et restituée au retour, déduction faite des sommes restant dues.',
    },
    { kind: 'heading', text: 'Article 3 — Usage du véhicule' },
    {
      kind: 'list',
      text: 'Le véhicule ne peut être conduit que par le locataire et les conducteurs désignés au contrat.\nToute sortie du territoire national est soumise à l’accord écrit préalable du loueur.\nLe véhicule ne peut servir au transport rémunéré de personnes ou de marchandises.\nLa sous-location est interdite.',
    },
    { kind: 'heading', text: 'Article 4 — Carburant et entretien' },
    {
      kind: 'paragraph',
      text: 'Le véhicule est restitué avec le même niveau de carburant qu’au départ. Le locataire signale sans délai toute anomalie ; il ne fait procéder à aucune réparation sans l’accord du loueur.',
    },
    { kind: 'heading', text: 'Article 5 — Restitution et retard' },
    {
      kind: 'paragraph',
      text: 'Le véhicule est restitué à la date convenue. **Toute journée entamée au-delà de cette date est due en entier**, au tarif journalier du présent contrat.',
    },
    { kind: 'heading', text: 'Article 6 — Amendes et contraventions' },
    {
      kind: 'paragraph',
      text: 'Les contraventions établies pendant la période de location restent à la charge du locataire, y compris lorsqu’elles parviennent au loueur après la restitution du véhicule.',
    },
    { kind: 'signatures', text: '' },
  ],

  ar: [
    { kind: 'heading', text: 'عقد كراء سيارة بدون سائق' },
    {
      kind: 'paragraph',
      text: 'بين **{{agency.name}}**، الكائن مقرها بـ {{agency.city}}، ويشار إليها فيما بعد بـ «المكري»، و**{{customer.name}}**، حامل بطاقة التعريف رقم {{customer.idNumber}} ورخصة السياقة رقم {{customer.licenceNumber}}، الساكن بـ {{customer.address}}، ويشار إليه فيما بعد بـ «المكتري».',
    },
    { kind: 'heading', text: 'الفصل 1 — الموضوع' },
    {
      kind: 'paragraph',
      text: 'يضع المكري رهن إشارة المكتري السيارة ذات رقم التسجيل **{{vehicle.plate}}** ({{vehicle.make}} {{vehicle.model}})، وعدّادها عند التسليم {{vehicle.km}} كلم، من {{contract.startAt}} إلى {{contract.endAt}}، أي {{contract.days}} يوم (أيام).',
    },
    { kind: 'heading', text: 'الفصل 2 — الثمن والضمانة' },
    {
      kind: 'paragraph',
      text: 'حُدّد ثمن الكراء في {{contract.dailyPrice}} عن كل يوم، أي **{{contract.total}}** مع احتساب جميع الرسوم. تُسلَّم ضمانة قدرها {{contract.deposit}} عند تسلّم السيارة وتُرجَع عند إعادتها بعد خصم المبالغ المتبقية.',
    },
    { kind: 'heading', text: 'الفصل 3 — استعمال السيارة' },
    {
      kind: 'list',
      text: 'لا يقود السيارة إلا المكتري والسائقون المعيّنون في العقد.\nكل خروج من التراب الوطني يخضع لموافقة كتابية مسبقة من المكري.\nلا يجوز استعمال السيارة في النقل المؤدى عنه للأشخاص أو البضائع.\nالكراء من الباطن ممنوع.',
    },
    { kind: 'heading', text: 'الفصل 4 — الوقود والصيانة' },
    {
      kind: 'paragraph',
      text: 'تُرجَع السيارة بنفس مستوى الوقود الذي سُلّمت به. يبلّغ المكتري فورا عن كل خلل، ولا يقوم بأي إصلاح دون موافقة المكري.',
    },
    { kind: 'heading', text: 'الفصل 5 — الإرجاع والتأخير' },
    {
      kind: 'paragraph',
      text: 'تُرجَع السيارة في التاريخ المتفق عليه. **كل يوم شُرع فيه بعد هذا التاريخ يُؤدى كاملا**، بالتعريفة اليومية المحددة في هذا العقد.',
    },
    { kind: 'heading', text: 'الفصل 6 — المخالفات' },
    {
      kind: 'paragraph',
      text: 'تبقى المخالفات المحرّرة خلال مدة الكراء على عاتق المكتري، ولو بلغت المكري بعد إرجاع السيارة.',
    },
    { kind: 'signatures', text: '' },
  ],

  en: [
    { kind: 'heading', text: 'Vehicle rental agreement (self-drive)' },
    {
      kind: 'paragraph',
      text: 'Between **{{agency.name}}**, having its office in {{agency.city}}, hereinafter “the lessor”, and **{{customer.name}}**, holder of identity document no. {{customer.idNumber}} and driving licence no. {{customer.licenceNumber}}, residing at {{customer.address}}, hereinafter “the renter”.',
    },
    { kind: 'heading', text: 'Article 1 — Purpose' },
    {
      kind: 'paragraph',
      text: 'The lessor makes available to the renter the vehicle registered **{{vehicle.plate}}** ({{vehicle.make}} {{vehicle.model}}), odometer at {{vehicle.km}} km, from {{contract.startAt}} to {{contract.endAt}}, that is {{contract.days}} day(s).',
    },
    { kind: 'heading', text: 'Article 2 — Price and deposit' },
    {
      kind: 'paragraph',
      text: 'The rental price is {{contract.dailyPrice}} per day, that is **{{contract.total}}** including all taxes. A deposit of {{contract.deposit}} is taken at pick-up and returned on hand-back, less any amount still owed.',
    },
    { kind: 'heading', text: 'Article 3 — Use of the vehicle' },
    {
      kind: 'list',
      text: 'The vehicle may only be driven by the renter and by the drivers named in this agreement.\nAny travel outside the national territory requires the lessor’s prior written consent.\nThe vehicle may not be used for the paid carriage of persons or goods.\nSubletting is prohibited.',
    },
    { kind: 'heading', text: 'Article 4 — Fuel and upkeep' },
    {
      kind: 'paragraph',
      text: 'The vehicle is returned with the same fuel level as at pick-up. The renter reports any fault without delay and carries out no repair without the lessor’s agreement.',
    },
    { kind: 'heading', text: 'Article 5 — Return and lateness' },
    {
      kind: 'paragraph',
      text: 'The vehicle is returned on the agreed date. **Any day started beyond that date is payable in full**, at the daily rate of this agreement.',
    },
    { kind: 'heading', text: 'Article 6 — Traffic fines' },
    {
      kind: 'paragraph',
      text: 'Fines issued during the rental period remain payable by the renter, including where they reach the lessor after the vehicle has been returned.',
    },
    { kind: 'signatures', text: '' },
  ],

  es: [
    { kind: 'heading', text: 'Contrato de alquiler de vehículo sin conductor' },
    {
      kind: 'paragraph',
      text: 'Entre **{{agency.name}}**, con domicilio en {{agency.city}}, en adelante «el arrendador», y **{{customer.name}}**, titular del documento de identidad n.º {{customer.idNumber}} y del permiso de conducir n.º {{customer.licenceNumber}}, con domicilio en {{customer.address}}, en adelante «el arrendatario».',
    },
    { kind: 'heading', text: 'Artículo 1 — Objeto' },
    {
      kind: 'paragraph',
      text: 'El arrendador pone a disposición del arrendatario el vehículo con matrícula **{{vehicle.plate}}** ({{vehicle.make}} {{vehicle.model}}), con {{vehicle.km}} km en el cuentakilómetros, desde el {{contract.startAt}} hasta el {{contract.endAt}}, es decir {{contract.days}} día(s).',
    },
    { kind: 'heading', text: 'Artículo 2 — Precio y fianza' },
    {
      kind: 'paragraph',
      text: 'El precio del alquiler es de {{contract.dailyPrice}} por día, es decir **{{contract.total}}** con todos los impuestos incluidos. Se entrega una fianza de {{contract.deposit}} en el momento de la recogida, que se devuelve a la entrega, descontadas las cantidades pendientes.',
    },
    { kind: 'heading', text: 'Artículo 3 — Uso del vehículo' },
    {
      kind: 'list',
      text: 'El vehículo solo puede ser conducido por el arrendatario y por los conductores designados en el contrato.\nCualquier salida del territorio nacional requiere el acuerdo previo por escrito del arrendador.\nEl vehículo no puede destinarse al transporte remunerado de personas o mercancías.\nQueda prohibido el subarriendo.',
    },
    { kind: 'heading', text: 'Artículo 4 — Combustible y mantenimiento' },
    {
      kind: 'paragraph',
      text: 'El vehículo se devuelve con el mismo nivel de combustible que en la recogida. El arrendatario comunica sin demora cualquier anomalía y no realiza ninguna reparación sin el acuerdo del arrendador.',
    },
    { kind: 'heading', text: 'Artículo 5 — Devolución y retraso' },
    {
      kind: 'paragraph',
      text: 'El vehículo se devuelve en la fecha convenida. **Todo día comenzado más allá de esa fecha se debe por entero**, a la tarifa diaria del presente contrato.',
    },
    { kind: 'heading', text: 'Artículo 6 — Multas' },
    {
      kind: 'paragraph',
      text: 'Las multas impuestas durante el período de alquiler corren a cargo del arrendatario, incluso cuando lleguen al arrendador después de la devolución del vehículo.',
    },
    { kind: 'signatures', text: '' },
  ],
}

/**
 * STOCKAGE DE FICHIERS — l'interface, et rien d'autre.
 *
 * Le produit garde des images (logo d'agence, vignette de voiture) et gardera demain
 * des scans (carte grise, permis, état des lieux). Les colonnes qui les désignent
 * existent depuis la Phase 3 — `scan_path`, `receipt_path`, `signature_path` — et
 * n'étaient reliées à rien : aucun code ne lisait `STORAGE_PROVIDER`, la variable
 * était déclarée dans `.env.example` avec un avertissement disant de ne pas y croire.
 *
 * Ce module ferme le trou. Quatre opérations, pas une de plus :
 *
 *  - `put` écrit et rend la CLÉ, jamais une URL. Une URL de Supabase signée expire, et
 *    une URL locale n'existe pas au même endroit d'un déploiement à l'autre : stocker
 *    l'une ou l'autre en base, c'est rendre la migration impossible. La base ne connaît
 *    que des clés, et c'est le serveur qui sait les résoudre.
 *  - `get` rend les octets et le type. Le fichier est SERVI par notre serveur
 *    (`/api/fichiers/*`), qui vérifie d'abord que la clé appartient à l'organisation de
 *    la session — c'est la seule façon de garder le cloisonnement sur des fichiers.
 *  - `remove` efface pour de bon. C'est la seule suppression DURE du produit, et elle
 *    est assumée : une photo remplacée n'a pas d'histoire à garder, et les octets d'un
 *    fichier orphelin se paient au mois chez l'hébergeur.
 *  - `available` dit si le fournisseur est utilisable, pour que l'écran cache le bouton
 *    de téléversement plutôt que d'offrir une action qui échouera.
 */

export interface StoredFile {
  bytes: Uint8Array
  contentType: string
}

export interface StorageProvider {
  readonly name: 'local' | 'supabase'
  put(key: string, file: StoredFile): Promise<void>
  get(key: string): Promise<StoredFile | null>
  remove(key: string): Promise<void>
}

/**
 * Les types d'image acceptés, et la raison de la liste courte.
 *
 * Un logo et une vignette de voiture sont des images, point. Accepter un SVG serait
 * accepter du JavaScript exécutable servi depuis notre domaine — un SVG est un
 * document XML qui peut porter un `<script>`, et le servir tel quel donne à quiconque
 * téléverse le droit d'exécuter du code dans la session des autres membres de son
 * agence. Le HEIC de l'iPhone n'est pas là non plus : aucun navigateur ne l'affiche,
 * et c'est le navigateur qui convertit avant l'envoi (`src/ui/forms/image-field.tsx`).
 */
export const IMAGE_TYPES: ReadonlyArray<string> = ['image/jpeg', 'image/png', 'image/webp']

/**
 * Taille maximale d'un fichier reçu, en octets.
 *
 * Un mégaoctet est LARGE pour ce qu'on stocke : le navigateur redimensionne avant
 * l'envoi, et une vignette de 640 px en WebP pèse une trentaine de kilo-octets. La
 * borne n'est pas là pour cadrer l'usage normal mais pour qu'un appel forgé ne puisse
 * pas remplir le disque, et elle est vérifiée côté SERVEUR — l'écran ne protège rien.
 */
export const MAX_UPLOAD_BYTES = 1_000_000

/** Extension canonique d'un type accepté. Sert à nommer la clé, jamais à la valider. */
export function extensionOf(contentType: string): string {
  if (contentType === 'image/png') return 'png'
  if (contentType === 'image/webp') return 'webp'
  return 'jpg'
}

/**
 * Type d'image déduit de l'extension d'une clé.
 *
 * On ne stocke pas le type à côté du fichier : la clé le porte déjà, et deux sources
 * pour la même information finissent par se contredire. Le repli est le JPEG, qui est
 * ce qu'une clé sans extension a le plus de chances d'être.
 */
export function contentTypeOf(key: string): string {
  if (key.endsWith('.png')) return 'image/png'
  if (key.endsWith('.webp')) return 'image/webp'
  return 'image/jpeg'
}

/**
 * La clé d'un fichier, et la règle de cloisonnement qu'elle porte.
 *
 * **Toute clé commence par `org/<orgId>/`.** Ce n'est pas une convention de rangement :
 * c'est ce qui permet à la route de service de refuser en une comparaison de chaîne un
 * fichier qui n'appartient pas à l'organisation de la session. Un stockage sans cette
 * discipline oblige à relire la base pour chaque octet servi — ou, plus souvent, à ne
 * rien vérifier du tout.
 *
 * Le nom est un UUID et non le nom d'origine du fichier : « Carte grise.jpeg » traverse
 * mal les systèmes de fichiers, et un nom choisi par l'utilisateur est un nom qui peut
 * contenir `../`.
 */
export function storageKey(
  orgId: string,
  kind: 'logo' | 'vehicle' | 'document',
  contentType: string,
): string {
  return `org/${orgId}/${kind}/${crypto.randomUUID()}.${extensionOf(contentType)}`
}

/** La clé appartient-elle bien à cette organisation ? Seule barrière au service. */
export function keyBelongsTo(key: string, orgId: string): boolean {
  // `..` refusé explicitement : le fournisseur local traduit la clé en chemin, et une
  // remontée de répertoire y servirait n'importe quel fichier de la machine.
  return key.startsWith(`org/${orgId}/`) && !key.includes('..')
}

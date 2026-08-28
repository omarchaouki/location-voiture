/**
 * ISO UTC → valeur d'un `<input type="datetime-local">`.
 *
 * Dans le fuseau du NAVIGATEUR, et c'est délibéré : la saisie fait le chemin inverse
 * avec `new Date(valeur).toISOString()`, qui interprète lui aussi la valeur en heure
 * locale du navigateur. Les deux conversions doivent utiliser le MÊME fuseau, sinon
 * ouvrir un formulaire de correction et le renvoyer sans rien toucher décalerait
 * l'heure — silencieusement, et d'autant plus qu'on est loin de Casablanca.
 *
 * **Ce n'est pas une exception à la règle « aucun `Intl` direct ».** `datetime-local`
 * attend un format MACHINE (`2026-08-28T14:30`), pas une date localisée : `Intl` n'a
 * rien à y faire, et `src/i18n/format.ts` reste le seul endroit qui produit des dates
 * destinées à être LUES.
 *
 * Le fuseau du métier (`businessParts`) sert au calcul des échéances, pas ici : ce
 * champ affiche et relit une valeur que l'utilisateur tape lui-même, et le
 * navigateur ne connaît que son propre fuseau.
 */
export function toLocalInput(iso: string): string {
  const date = new Date(iso)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

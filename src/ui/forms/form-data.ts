/**
 * Lecture typée d'un champ de formulaire.
 *
 * `FormData.get()` renvoie `string | File | null`. Passer ça à `String()` produit
 * « [object Object] » pour un fichier — ESLint le refuse, et il a raison : c'est
 * exactement le genre de valeur qui finit en base sans que personne ne le voie.
 */
export function textField(form: FormData, name: string): string {
  const value = form.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

/** Idem, mais restreint à une liste de valeurs attendues. */
export function choiceField<const T extends readonly string[]>(
  form: FormData,
  name: string,
  allowed: T,
  fallback: T[number],
): T[number] {
  const value = textField(form, name)
  const match = allowed.find((candidate) => candidate === value)
  return match ?? fallback
}

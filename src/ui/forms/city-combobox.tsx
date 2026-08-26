import { useTranslation } from 'react-i18next'

import { MOROCCAN_CITIES } from '~/core/cities'
import { Combobox } from './combobox'

/**
 * Ville — champ à saisie assistée, jamais une liste déroulante.
 *
 * Soixante villes dans un `<select>`, c'est une roulette qu'on fait défiler au pouce
 * sur téléphone. Ici, trois lettres suffisent, les accents sont ignorés dans la
 * comparaison (« Kenitra » trouve « Kénitra ») et le nom arabe est cherché en même
 * temps que le nom français.
 *
 * **Le mode est `free`, délibérément.** La liste couvre les villes où l'on loue des
 * voitures, pas les mille cinq cents communes du royaume. Un champ qui refuserait
 * « Imilchil » parce qu'elle n'est pas dans une liste écrite à Casablanca serait un
 * champ qui a tort — la liste aide à taper, elle n'autorise pas.
 */
export function CityCombobox({
  name,
  label,
  required = false,
  defaultValue = '',
}: {
  name: string
  label: string
  required?: boolean
  defaultValue?: string
}) {
  const { t, i18n } = useTranslation()
  const arabic = i18n.language.startsWith('ar')

  return (
    <Combobox
      name={name}
      label={label}
      required={required}
      defaultValue={defaultValue}
      mode="free"
      hint={t('form.cityHint')}
      emptyLabel={t('form.noMatch')}
      countLabel={(count) => t('form.matchCount', { count })}
      options={MOROCCAN_CITIES.map((city) => ({
        value: arabic ? city.ar : city.fr,
        label: arabic ? city.ar : city.fr,
        // L'autre écriture reste cherchable : un gérant tape parfois l'une, parfois l'autre.
        detail: arabic ? city.fr : city.ar,
      }))}
    />
  )
}

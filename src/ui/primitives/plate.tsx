import { formatPlate, parsePlate, type Plate as PlateValue } from '~/core/plate'

/**
 * Affichage d'une plaque marocaine.
 *
 * Le `<bdi>` n'est pas décoratif : la chaîne mélange chiffres latins et lettre arabe,
 * et sans isolation l'ordre des trois blocs s'inverse à la lecture. docs/DOMAIN.md §6.
 */
export function Plate({
  value,
  size = 'md',
  className,
}: {
  /** Plaque déjà analysée, ou saisie brute à analyser. */
  value: PlateValue | string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const parsed = typeof value === 'string' ? parsePlate(value) : value

  const sizeClass =
    size === 'lg' ? 'text-lg' : size === 'sm' ? 'text-xs' : 'text-sm'

  // Une plaque non analysable s'affiche telle quelle plutôt que de disparaître :
  // mieux vaut une plaque bizarre à l'écran qu'un véhicule invisible.
  if (parsed === null) {
    return (
      <bdi className={`numeric ${sizeClass} ${className ?? ''}`} dir="ltr">
        {typeof value === 'string' ? value : ''}
      </bdi>
    )
  }

  return (
    <bdi
      className={`numeric tracking-tight ${sizeClass} ${className ?? ''}`}
      dir="ltr"
      title={formatPlate(parsed)}
    >
      {formatPlate(parsed)}
    </bdi>
  )
}

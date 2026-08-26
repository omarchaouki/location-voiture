import { useTranslation } from 'react-i18next'

/**
 * Pages légales — mentions et confidentialité.
 *
 * Un seul composant pour les deux : elles ont exactement la même forme, et deux
 * gabarits presque identiques divergent toujours. Le contenu vient de l'i18n, comme
 * le reste du produit : un texte légal non traduit sur un site trilingue est un
 * texte légal qui ne s'applique pas à deux tiers des visiteurs.
 *
 * `max-w-prose` n'est pas décoratif : au-delà de 75 caractères par ligne, l'œil perd
 * le début de la ligne suivante. C'est la seule page du produit faite pour être lue
 * d'un bout à l'autre.
 */
export function LegalPage({
  titleKey,
  updatedKey,
  sectionKeys,
}: {
  titleKey: string
  updatedKey: string
  sectionKeys: readonly string[]
}) {
  const { t } = useTranslation()

  return (
    <article className="max-w-prose">
      <h1 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
        {t(titleKey)}
      </h1>
      <p className="mt-2 text-xs text-muted">{t(updatedKey)}</p>

      <div className="mt-8 space-y-8">
        {sectionKeys.map((key) => (
          <section key={key}>
            <h2 className="font-display text-md font-semibold">{t(`${key}.title`)}</h2>
            <p className="mt-2 text-sm whitespace-pre-line text-muted">{t(`${key}.body`)}</p>
          </section>
        ))}
      </div>
    </article>
  )
}

import { createFileRoute, redirect } from '@tanstack/react-router'

import { DEFAULT_LOCALE } from '~/i18n/locales'

/**
 * La racine n'a pas de contenu propre : toute page vit sous une langue.
 *
 * TODO (Phase 11) : négocier la langue à partir de `Accept-Language` plutôt que de
 * rediriger systématiquement vers le français. Tant que ce n'est pas fait, un
 * visiteur arabophone arrive en français et doit cliquer — c'est un défaut connu,
 * pas un oubli.
 */
export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({ to: '/$lang', params: { lang: DEFAULT_LOCALE } })
  },
})

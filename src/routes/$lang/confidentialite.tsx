import { createFileRoute } from '@tanstack/react-router'

import { LegalPage } from '~/ui/legal/legal-page'

/**
 * Politique de confidentialité.
 *
 * Elle décrit ce que le LOGICIEL fait réellement — les données qu'il collecte, la
 * durée pendant laquelle il les garde, ce qui sort vers un tiers — et rien d'autre.
 * Chaque affirmation correspond à une décision écrite dans `docs/DECISIONS.md` :
 * purge des positions GPS, condensé des adresses IP, absence d'envoi depuis les
 * espaces de démonstration.
 */
export const Route = createFileRoute('/$lang/confidentialite')({
  component: PrivacyPage,
})

const SECTIONS = [
  'legal.privacy.collected',
  'legal.privacy.purpose',
  'legal.privacy.retention',
  'legal.privacy.sharing',
  'legal.privacy.rights',
] as const

function PrivacyPage() {
  return (
    <LegalPage
      titleKey="legal.privacy.title"
      updatedKey="legal.updated"
      sectionKeys={SECTIONS}
    />
  )
}

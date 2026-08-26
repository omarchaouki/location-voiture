import { createFileRoute } from '@tanstack/react-router'

import { LegalPage } from '~/ui/legal/legal-page'

/**
 * Mentions légales.
 *
 * L'identité de l'éditeur — raison sociale, RC, ICE, adresse, hébergeur — est
 * VOLONTAIREMENT laissée en attente et signalée comme telle sur la page. Inventer
 * un numéro de registre du commerce produirait un document faux ayant l'apparence
 * d'un document légal ; l'omettre en silence produirait la même chose, sans le dire.
 */
export const Route = createFileRoute('/$lang/mentions-legales')({
  component: LegalNoticePage,
})

const SECTIONS = [
  'legal.notice.publisher',
  'legal.notice.hosting',
  'legal.notice.property',
  'legal.notice.liability',
  'legal.notice.contact',
] as const

function LegalNoticePage() {
  return (
    <LegalPage
      titleKey="legal.notice.title"
      updatedKey="legal.updated"
      sectionKeys={SECTIONS}
    />
  )
}

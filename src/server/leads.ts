import { createServerFn } from '@tanstack/react-start'
import { getRequest, getRequestIP } from '@tanstack/react-start/server'
import { z } from 'zod'

import { LeadInput } from '~/core/schemas/lead'
import { requirePlatformOwner } from '~/auth/context'
import { getDb } from '~/db/client'
import { leadRepository } from '~/db/repositories/leads'
import { businessCivilDate } from '~/i18n/format'
import { hashIp, recordLead, type LeadOutcome } from './lead-intake'

/**
 * DEMANDES DE DÉMONSTRATION — le seul point d'écriture PUBLIC du produit.
 *
 * Ce fichier ne contient QUE des server functions. La logique vit dans
 * `src/server/lead-intake.ts` : elle importe `node:crypto` et le repository, et une
 * fonction exportée à côté d'un gestionnaire n'est pas retirée du paquet client.
 */

export const submitLead = createServerFn({ method: 'POST' })
  .validator(LeadInput)
  .handler(async ({ data }): Promise<LeadOutcome> => {
    const secret = process.env['AUTH_SECRET'] ?? 'dev-only-secret-change-me'
    return recordLead(getDb(), data, {
      ipHash: hashIp(getRequestIP() ?? null, secret),
      now: new Date(),
    })
  })

export interface AdminLead {
  id: string
  name: string
  phone: string
  company: string | null
  email: string | null
  city: string | null
  fleetSize: string | null
  message: string | null
  locale: string
  status: string
  createdAt: string
}

export const listLeads = createServerFn({ method: 'GET' }).handler(
  async (): Promise<AdminLead[]> => {
    const { headers } = getRequest()
    await requirePlatformOwner(headers)

    const rows = await leadRepository(getDb()).list()
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      company: row.company,
      email: row.email,
      city: row.city,
      fleetSize: row.fleetSize,
      message: row.message,
      locale: row.locale,
      status: row.status,
      createdAt: row.createdAt,
    }))
  },
)

export const markLeadContacted = createServerFn({ method: 'POST' })
  .validator(z.object({ leadId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const { headers } = getRequest()
    await requirePlatformOwner(headers)

    const done = await leadRepository(getDb()).markContacted(
      data.leadId,
      businessCivilDate(new Date()),
    )
    return { ok: done }
  })

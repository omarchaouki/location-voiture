import { useMemo } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'

import { civilDaysBetween, type CivilDate } from '~/core/dates'
import type { LogbookEntry, LogbookKind } from '~/core/logbook'
import { layoutRail } from '~/core/rail-layout'
import { formatDateShort } from '~/i18n/format'
import { isLocale, type Locale, DEFAULT_LOCALE } from '~/i18n/locales'
import {
  ContractSignedIcon,
  InspectionBadgeIcon,
  InsuranceShieldIcon,
  OilGaugeIcon,
  PermitIcon,
  RoadTaxStickerIcon,
  ServiceGearIcon,
} from '~/ui/icons'
import { Stamp } from '~/ui/primitives/stamp'
import type { IconProps } from '~/ui/icons'

/**
 * LA FRISE DU CARNET — la signature du produit (docs/DESIGN.md §5).
 *
 * Le temps descend. Une ligne « aujourd'hui » traverse la page. Ce qui est fait est
 * au-dessus en filet plein ; ce qui vient est en dessous en filet pointillé ; ce qui
 * est dépassé est PHYSIQUEMENT au-dessus de la ligne, ce qui est littéralement vrai
 * et se lit sans légende.
 *
 * On ne lit pas une liste de dates : on voit le temps arriver sur la voiture.
 */

const ICONS: Record<LogbookKind, (props: IconProps) => React.JSX.Element> = {
  insurance: InsuranceShieldIcon,
  inspection: InspectionBadgeIcon,
  roadTax: RoadTaxStickerIcon,
  permit: PermitIcon,
  oilChange: OilGaugeIcon,
  contractReturn: ContractSignedIcon,
  maintenanceDone: ServiceGearIcon,
}

export type { LogbookEntry } from '~/core/logbook'

export function LogbookRail({
  entries,
  today,
  className,
}: {
  entries: ReadonlyArray<LogbookEntry>
  /** Date civile d'aujourd'hui, calculée en heure de Casablanca par l'appelant. */
  today: CivilDate
  className?: string
}) {
  const { t, i18n } = useTranslation()
  const locale: Locale = isLocale(i18n.language) ? i18n.language : DEFAULT_LOCALE

  const { ordered, layout } = useMemo(() => {
    const withDays = entries.map((entry) => ({
      entry,
      days: civilDaysBetween(today, entry.date),
    }))
    // L'ordre du DOM suit l'ordre chronologique : la lecture au clavier et au
    // lecteur d'écran doit être la même que la lecture à l'œil.
    withDays.sort((a, b) => a.days - b.days)
    return {
      ordered: withDays,
      layout: layoutRail(withDays.map(({ entry, days }) => ({ id: entry.id, days }))),
    }
  }, [entries, today])

  const positions = new Map(layout.placements.map((placement) => [placement.id, placement.y]))

  return (
    <div className={`relative ${className ?? ''}`} style={{ height: layout.height }}>
      {/* Le rail lui-même : plein au-dessus d'aujourd'hui, pointillé en dessous. */}
      <span
        aria-hidden="true"
        className="absolute w-px bg-rule"
        style={{ insetInlineStart: '5.75rem', top: 0, height: layout.todayY }}
      />
      <span
        aria-hidden="true"
        className="absolute w-px border-s border-dashed border-rule"
        style={{
          insetInlineStart: '5.75rem',
          top: layout.todayY,
          height: Math.max(0, layout.height - layout.todayY),
        }}
      />

      {/* La ligne « aujourd'hui » : le seul élément en couleur d'accent de l'écran. */}
      <div
        className="absolute start-0 end-0 flex items-center gap-3"
        style={{ top: layout.todayY, transform: 'translateY(-50%)' }}
      >
        <span className="numeric w-23 shrink-0 text-end text-2xs tracking-wide text-stamp uppercase">
          {t('deadline.today')}
        </span>
        <span aria-hidden="true" className="h-0 flex-1 border-t-2 border-double border-stamp" />
      </div>

      <ol className="contents">
        {ordered.map(({ entry, days }) => {
          const IconComponent = ICONS[entry.kind]
          const y = positions.get(entry.id) ?? 0
          const isOverdue = entry.state === 'overdue'
          const isDone = entry.state === 'done'

          return (
            <li
              key={entry.id}
              className="absolute start-0 end-0 flex items-start gap-3"
              style={{ top: y, transform: 'translateY(-50%)' }}
            >
              <time
                dateTime={entry.date}
                className="numeric w-23 shrink-0 pt-[2px] text-end text-xs text-muted"
              >
                {formatDateShort(entry.date, locale)}
              </time>

              <span
                aria-hidden="true"
                className={`rail-dot mt-[6px] h-[7px] w-[7px] shrink-0 rounded-full ${
                  isOverdue ? 'bg-danger' : isDone ? 'bg-rule-strong' : 'bg-ink'
                }`}
              />

              <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="flex items-center gap-2">
                  <IconComponent
                    size={17}
                    className={isOverdue ? 'text-danger' : isDone ? 'text-muted' : 'text-ink'}
                  />
                  <span className={`text-sm ${isDone ? 'text-muted' : ''}`}>
                    {t(`deadline.${entry.kind}`)}
                  </span>
                </span>

                {entry.detail ? (
                  <span className="numeric text-xs text-muted">{entry.detail}</span>
                ) : null}

                <span className="ms-auto flex items-center gap-2">
                  {isOverdue ? (
                    <Stamp tone="danger">{t('deadline.expired')}</Stamp>
                  ) : (
                    <span
                      className={`text-xs ${isDone ? 'text-muted' : days <= 7 ? 'text-warn' : 'text-muted'}`}
                    >
                      {relativeLabel(days, isDone, t)}
                    </span>
                  )}
                </span>
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function relativeLabel(
  days: number,
  isDone: boolean,
  t: TFunction,
): string {
  if (isDone) return t('deadline.done')
  if (days === 0) return t('deadline.today')
  if (days > 0) return t('deadline.inDays', { count: days })
  return t('deadline.overdueDays', { count: Math.abs(days) })
}

import {
  currencySymbols,
  wineTypeLabels,
  type EntryListItemDto,
  type Locale,
} from '@between-bubbles/contracts'
import { Link } from '@tanstack/react-router'

import { Typography } from '@/components/ui/typography'
import { useTranslation } from '@/features/auth'
import { cn } from '@/lib/utils'
import type { Translate } from '@/platform/i18n'
import { RatingPill } from './RatingPill'

/**
 * Строка записи в неделе, карточке вина и корзине.
 *
 * Заметки в списке не показываются — они раскрываются по тапу на карточке записи
 * (DESIGN.md → Feed Entry Card). Миниатюра первого фото (ТЗ §10.5) — без рамки и радиуса,
 * как требует дизайн-система; у записи без фото места под неё не остаётся вовсе.
 */
export function EntryRow({
  entry,
  className,
}: {
  entry: EntryListItemDto
  className?: string
}) {
  const { t, locale } = useTranslation()

  return (
    <Typography asChild variant="body">
      <Link
        to="/entries/$entryId"
        params={{ entryId: entry.id }}
        className={cn(
          'flex items-center gap-4 border-b border-border bg-card p-4 hover:bg-background',
          className,
        )}
      >
        {entry.thumbUrl !== null && (
          <img
            src={entry.thumbUrl}
            // Название вина стоит рядом, поэтому миниатюра для скринридера декоративна.
            alt=""
            width={56}
            height={56}
            className="h-14 w-14 shrink-0 object-cover"
          />
        )}
        <span className="grid min-w-0 flex-1 gap-1">
          <Typography variant="wineName" truncate>
            {entry.wineName}
          </Typography>
          <Typography variant="capsMeta" tone="muted">
            {metaLine(entry, t, locale)}
          </Typography>
        </span>
        <RatingPill value={entry.rating} />
      </Link>
    </Typography>
  )
}

function metaLine(entry: EntryListItemDto, t: Translate, locale: Locale): string {
  const parts = [wineTypeLabels[entry.wineType][locale]]

  if (entry.price !== null && entry.currency !== null) {
    // Повтор той же бутылки помечается, чтобы цена не читалась как новая трата (ТЗ §7.4).
    const price = `${Math.round(entry.price)} ${currencySymbols[entry.currency]}`
    parts.push(
      entry.isSameBottleRepeat ? `${price} · ${t('entry.sameBottleTag')}` : price,
    )
  }

  if (entry.tasteCategory) {
    parts.push(entry.tasteCategory)
  }

  parts.push(t('entry.glassesShort', { count: entry.glasses }))

  return parts.join(' · ')
}

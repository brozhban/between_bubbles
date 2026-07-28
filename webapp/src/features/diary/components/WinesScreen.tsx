import { wineTypeLabels, type Locale, type WineType } from '@between-bubbles/contracts'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'

import { Spinner } from '@/components/ui/spinner'
import { Typography } from '@/components/ui/typography'
import { useTranslation } from '@/features/auth'
import { useWinesQuery } from '../queries'
import type { MessageKey, Translate } from '@/platform/i18n'
import { formatDate } from '../format'
import { FlavorChips } from './FlavorChips'
import { RatingPill } from './RatingPill'
import { UnderlineInput } from './UnderlineField'

const sortOptions = [
  { id: 'lastTasted', key: 'wines.sortByDate' },
  { id: 'rating', key: 'wines.sortByRating' },
  { id: 'name', key: 'wines.sortByName' },
] as const satisfies ReadonlyArray<{ id: string; key: MessageKey }>



/** Порог берём крупными шагами: полубалльная сетка в фильтре только мешает выбирать. */
const ratingOptions = [3, 3.5, 4, 4.5, 5].map((value) => ({
  id: String(value),
  label: value.toFixed(1),
}))

/** «Мои вина» (ТЗ §10.8): поиск, фильтры по типу и рейтингу, три сортировки. */
export function WinesScreen() {
  const { t, locale } = useTranslation()
  const typeOptions = (Object.keys(wineTypeLabels) as WineType[]).map((type) => ({
    id: type,
    label: wineTypeLabels[type][locale],
  }))
  const [search, setSearch] = useState('')
  const [type, setType] = useState<WineType | null>(null)
  const [ratingMin, setRatingMin] = useState<number | null>(null)
  const [sort, setSort] = useState<(typeof sortOptions)[number]['id']>('lastTasted')

  const wines = useWinesQuery({
    search: search.trim() || undefined,
    type: type ?? undefined,
    // Фильтр по среднему рейтингу вина: снизу — «не хуже», сверху границы нет.
    ratingMin: ratingMin ?? undefined,
    sort,
    order: sort === 'name' ? 'asc' : 'desc',
  })

  return (
    <div className="grid gap-8 p-4 pb-10">
      <header className="grid gap-4">
        <Typography variant="wineNameLg">{t('wines.title')}</Typography>
        <UnderlineInput
          label={t('wines.search')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <FlavorChips
          label={t('wines.type')}
          options={typeOptions}
          selected={type ? [type] : []}
          onToggle={(id) => setType((current) => (current === id ? null : (id as WineType)))}
          tone="a"
        />
        <FlavorChips
          label={t('wines.ratingAtLeast')}
          options={ratingOptions}
          selected={ratingMin === null ? [] : [String(ratingMin)]}
          onToggle={(id) =>
            setRatingMin((current) => (current === Number(id) ? null : Number(id)))
          }
          tone="a"
        />
        <FlavorChips
          label={t('wines.sort')}
          options={sortOptions.map((option) => ({ id: option.id, label: t(option.key) }))}
          selected={[sort]}
          onToggle={(id) => setSort(id as (typeof sortOptions)[number]['id'])}
          tone="b"
        />
      </header>

      {wines.isPending && (
        <div className="flex items-center gap-3">
          <Spinner />
          <Typography variant="bodySm" tone="muted">
            {t('wines.loading')}
          </Typography>
        </div>
      )}

      {wines.isError && (
        <Typography role="alert" tone="destructive">
          {t('wines.failed')}
        </Typography>
      )}

      {wines.data?.items.length === 0 && (
        <Typography tone="muted">
          {t('wines.empty')}
        </Typography>
      )}

      <div className="grid">
        {wines.data?.items.map((wine) => (
          <Typography key={wine.id} asChild variant="body">
            <Link
              to="/wines/$wineId"
              params={{ wineId: wine.id }}
              className="flex items-center gap-4 border-b border-border bg-card p-4 hover:bg-background"
            >
              <span className="grid min-w-0 flex-1 gap-1">
                <Typography variant="wineName" truncate>
                  {wine.name}
                </Typography>
                <Typography variant="capsMeta" tone="muted">
                  {metaLine(wine, t, locale)}
                </Typography>
              </span>
              {wine.averageRating !== null && <RatingPill value={wine.averageRating} />}
            </Link>
          </Typography>
        ))}
      </div>
    </div>
  )
}

function metaLine(
  wine: { type: WineType; tastingCount: number; lastTastedOn: string | null },
  t: Translate,
  locale: Locale,
): string {
  const parts = [
    wineTypeLabels[wine.type][locale],
    t('wines.tastingsShort', { count: wine.tastingCount }),
  ]
  if (wine.lastTastedOn) parts.push(formatDate(wine.lastTastedOn, locale))
  return parts.join(' · ')
}

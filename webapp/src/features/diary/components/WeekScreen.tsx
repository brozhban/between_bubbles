import {
  currencySymbols,
  tasteCategoryLabels,
  type Locale,
  type WeekMetricsDto,
  type WeekResponse,
} from '@between-bubbles/contracts'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

import { Spinner } from '@/components/ui/spinner'
import { Typography } from '@/components/ui/typography'
import { useTranslation } from '@/features/auth'
import type { Translate } from '@/platform/i18n'
import { useWeekQuery } from '../queries'
import { EntryRow } from './EntryRow'
import { OutlinedButton, TextLinkAction } from './OutlinedButton'
import { RatingPill } from './RatingPill'
import { WeekCalendar } from './WeekCalendar'
import { WeekCharts } from './WeekCharts'

/**
 * Главный экран (ТЗ §10.5). Понятия «архив» нет: недели равноправны и листаются
 * в обе стороны, а пустая неделя показывает только заголовок, календарь и empty-state.
 */
export function WeekScreen() {
  const { t, locale } = useTranslation()
  const navigate = useNavigate()
  const [date, setDate] = useState<string | undefined>(undefined)
  const week = useWeekQuery(date)

  if (week.isPending) {
    return (
      <div className="flex items-center gap-3 p-6">
        <Spinner />
        <Typography variant="bodySm" tone="muted">
          {t('week.loading')}
        </Typography>
      </div>
    )
  }

  if (week.isError) {
    return (
      <div className="grid gap-4 p-6" role="alert">
        <Typography variant="screenTitle">{t('week.failed')}</Typography>
        <Typography tone="muted">{t('week.failedHint')}</Typography>
        <OutlinedButton type="button" onClick={() => void week.refetch()}>
          {t('session.retry')}
        </OutlinedButton>
      </div>
    )
  }

  const data = week.data

  return (
    <div className="grid gap-8 p-4 pb-10">
      <WeekHeader
        t={t}
        locale={locale}
        week={data}
        onShift={(days) => setDate(shiftDate(data.startDate, days))}
        onToday={() => setDate(undefined)}
      />

      {data.metrics && <MetricsBlock metrics={data.metrics} t={t} locale={locale} />}

      <WeekCalendar days={data.days} />

      {data.metrics && (
        <WeekCharts metrics={data.metrics} days={data.days} locale={locale} />
      )}

      {data.entries.length === 0 ? (
        <div className="grid gap-4 border border-border p-6">
          <Typography variant="wineNameLg">{t('week.empty')}</Typography>
          <Typography tone="muted">{t('week.emptyHint')}</Typography>
          <OutlinedButton type="button" onClick={() => void navigate({ to: '/add' })}>
            {t('week.addWine')}
          </OutlinedButton>
        </div>
      ) : (
        <div className="grid">
          {data.entries.map((entry) => (
            <EntryRow key={entry.id} entry={entry} />
          ))}
        </div>
      )}

      {/*
        Статистика и корзина живут ссылками отсюда, а не пунктами нижней навигации: на 360 px
        пятый пункт превращает её в нечитаемую ленту, а заходят сюда заметно реже.
      */}
      <div className="flex flex-wrap items-center gap-6">
        <TextLinkAction type="button" onClick={() => void navigate({ to: '/stats' })}>
          {t('week.stats')}
        </TextLinkAction>
        <TextLinkAction type="button" onClick={() => void navigate({ to: '/trash' })}>
          {t('week.trash')}
        </TextLinkAction>
      </div>
    </div>
  )
}

function WeekHeader({
  week,
  onShift,
  onToday,
  t,
  locale,
}: {
  week: WeekResponse
  onShift: (days: number) => void
  onToday: () => void
  t: Translate
  locale: Locale
}) {
  return (
    <header className="grid gap-3">
      <Typography variant="capsLabel" tone="muted">
        {t('week.label', { week: week.isoWeek, year: week.isoYear })}
      </Typography>
      <Typography variant="wineNameLg">{formatRange(week.startDate, week.endDate, locale)}</Typography>
      <div className="flex items-center justify-between">
        <TextLinkAction type="button" arrow="" onClick={() => onShift(-7)}>
          {t('week.previous')}
        </TextLinkAction>
        {!week.isCurrent && (
          <TextLinkAction type="button" arrow="" onClick={onToday}>
            {t('week.today')}
          </TextLinkAction>
        )}
        <TextLinkAction type="button" arrow="" onClick={() => onShift(7)}>
          {t('week.next')}
        </TextLinkAction>
      </div>
    </header>
  )
}

function MetricsBlock({
  metrics,
  t,
  locale,
}: {
  metrics: WeekMetricsDto
  t: Translate
  locale: Locale
}) {
  return (
    <section className="grid gap-6 border border-border p-4">
      <div className="grid grid-cols-3 gap-4">
        <Metric label={t('week.totalEntries')} value={String(metrics.totalEntries)} />
        <Metric label={t('week.totalGlasses')} value={String(metrics.totalGlasses)} />
        <Metric label={t('week.totalMl')} value={String(metrics.totalMl)} />
      </div>

      {metrics.topEntries.length > 0 && (
        <div className="grid gap-2">
          <Typography variant="capsLabel" tone="muted">
            {metrics.topEntries.length > 1 ? t('week.topWines') : t('week.topWine')}
          </Typography>
          {metrics.topEntries.map((top) => (
            <div key={top.entryId} className="flex items-center justify-between gap-4">
              <Typography variant="wineName" truncate>
                {top.wineName}
              </Typography>
              <RatingPill value={top.rating} />
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-2">
        <Typography variant="capsLabel" tone="muted">
          {t('week.topCategory')}
        </Typography>
        <Typography variant="bodySm">
          {metrics.topTasteCategories.length === 0
            ? '—'
            : metrics.topTasteCategories
                .map((category) => `${category} — ${tasteCategoryLabels[category][locale]}`)
                .join(', ')}
        </Typography>
      </div>

      {metrics.spendByCurrency !== null && metrics.spendByCurrency.length > 0 && (
        <div className="grid gap-2">
          <Typography variant="capsLabel" tone="muted">
            {t('week.spend')}
          </Typography>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {metrics.spendByCurrency.map((total) => (
              <Typography key={total.currency} variant="fieldValue">
                {`${Math.round(total.total)} ${currencySymbols[total.currency]}`}
              </Typography>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <Typography variant="capsLabel" tone="muted">
        {label}
      </Typography>
      <Typography variant="displayNumber">{value}</Typography>
    </div>
  )
}

function shiftDate(date: string, days: number): string {
  const shifted = new Date(`${date}T00:00:00.000Z`)
  shifted.setUTCDate(shifted.getUTCDate() + days)
  return shifted.toISOString().slice(0, 10)
}

function formatRange(startDate: string, endDate: string, locale: Locale): string {
  const format = (value: string) =>
    new Date(`${value}T00:00:00.000Z`).toLocaleDateString(locale === 'en' ? 'en-GB' : 'ru-RU', {
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    })

  return `${format(startDate)} — ${format(endDate)}`
}

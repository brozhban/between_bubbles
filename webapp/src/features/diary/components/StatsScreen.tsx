import {
  currencySymbols,
  wineTypeLabels,
  type StatsPeriod,
  type StatsShareDto,
  type StatsWeekPointDto,
} from '@between-bubbles/contracts'
import { useState } from 'react'

import { Spinner } from '@/components/ui/spinner'
import { Typography } from '@/components/ui/typography'
import { useTranslation } from '@/features/auth'
import { countryName } from '../countries'
import { useStatsQuery } from '../queries'
import { CategoryBars, WineTypePie } from './WeekCharts'
import { FlavorChips } from './FlavorChips'
import { RatingPill } from './RatingPill'

const periods: readonly StatsPeriod[] = ['month', 'year', 'all']

/**
 * Статистика за период (ТЗ §10.9).
 *
 * Диаграммы по типам и категориям — те же компоненты, что и в неделе: одинаковые данные
 * должны выглядеть одинаково, где бы человек их ни увидел. Динамика по неделям и топы по
 * странам и сортам живут только здесь, поэтому и собраны на месте.
 */
export function StatsScreen() {
  const { t, locale } = useTranslation()
  const [period, setPeriod] = useState<StatsPeriod>('month')
  const stats = useStatsQuery(period)

  return (
    <div className="grid gap-8 p-4 pb-10">
      <header className="grid gap-4">
        <Typography variant="wineNameLg">{t('stats.title')}</Typography>
        <FlavorChips
          label={t('stats.period')}
          tone="b"
          options={periods.map((option) => ({
            id: option,
            label: t(`stats.period.${option}`),
          }))}
          selected={[period]}
          onToggle={(id) => setPeriod(id as StatsPeriod)}
        />
      </header>

      {stats.isPending && (
        <div className="flex items-center gap-3">
          <Spinner />
          <Typography variant="bodySm" tone="muted">
            {t('stats.loading')}
          </Typography>
        </div>
      )}

      {stats.isError && (
        <Typography role="alert" tone="destructive">
          {t('stats.failed')}
        </Typography>
      )}

      {stats.data && stats.data.totalEntries === 0 && (
        <Typography tone="muted">{t('stats.empty')}</Typography>
      )}

      {stats.data && stats.data.totalEntries > 0 && (
        <>
          <section className="grid grid-cols-3 gap-4 border border-border p-4">
            <Metric label={t('week.totalEntries')} value={String(stats.data.totalEntries)} />
            <Metric label={t('week.totalGlasses')} value={formatNumber(stats.data.totalGlasses)} />
            <Metric label={t('week.totalMl')} value={String(stats.data.totalMl)} />
          </section>

          {stats.data.spendByCurrency !== null && stats.data.spendByCurrency.length > 0 && (
            <section className="grid gap-2">
              <Typography variant="capsLabel" tone="muted">
                {t('week.spend')}
              </Typography>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {stats.data.spendByCurrency.map((total) => (
                  <Typography key={total.currency} variant="fieldValue">
                    {`${Math.round(total.total)} ${currencySymbols[total.currency]}`}
                  </Typography>
                ))}
              </div>
            </section>
          )}

          <section className="grid gap-3">
            <Typography variant="capsLabel" tone="muted">
              {t('stats.topWines')}
            </Typography>
            <div className="grid">
              {stats.data.topWines.map((wine) => (
                <div
                  key={wine.wineId}
                  className="flex items-center gap-4 border-b border-border bg-card p-4"
                >
                  <span className="grid min-w-0 flex-1 gap-1">
                    <Typography variant="wineName" truncate>
                      {wine.name}
                    </Typography>
                    {/* Рейтинг стоит справа в пилюле — во второй раз в строке он лишний. */}
                    <Typography variant="capsMeta" tone="muted">
                      {`${wineTypeLabels[wine.type][locale]} · ${t('wines.tastingsShort', {
                        count: wine.tastingCount,
                      })}`}
                    </Typography>
                  </span>
                  <RatingPill value={wine.averageRating} />
                </div>
              ))}
            </div>
          </section>

          <WeeklyBars weeks={stats.data.weeks} />
          <WineTypePie distribution={stats.data.typeDistribution} locale={locale} />
          <CategoryBars distribution={stats.data.categoryDistribution} locale={locale} />

          <RankedShares
            label={t('stats.byCountry')}
            shares={stats.data.countryDistribution}
            format={(key) => countryName(key, locale)}
          />
          <RankedShares
            label={t('stats.byGrape')}
            shares={stats.data.grapeDistribution}
            format={(key) => key}
          />
        </>
      )}
    </div>
  )
}

/** Динамика по неделям (ТЗ §10.9) с тем же переключателем «Вина / Бокалы», что и в неделе. */
function WeeklyBars({ weeks }: { weeks: readonly StatsWeekPointDto[] }) {
  const { t } = useTranslation()
  const [measure, setMeasure] = useState<'entries' | 'glasses'>('entries')

  if (weeks.length === 0) return null

  const values = weeks.map((week) => (measure === 'entries' ? week.entryCount : week.glasses))
  const peak = Math.max(...values, 1)

  return (
    <section className="grid gap-4">
      <Typography variant="capsLabel" tone="muted">
        {t('stats.byWeek')}
      </Typography>

      <FlavorChips
        tone="b"
        options={[
          { id: 'entries', label: t('charts.entries') },
          { id: 'glasses', label: t('charts.glasses') },
        ]}
        selected={[measure]}
        onToggle={(id) => setMeasure(id as 'entries' | 'glasses')}
      />

      {/* Недель за год набирается полсотни: полосу прокручиваем, а не сжимаем в нечитаемое. */}
      <div className="-mx-4 overflow-x-auto px-4">
        <div className="flex h-40 min-w-full gap-1">
          {weeks.map((week, index) => {
            const value = values[index] ?? 0
            return (
              <div key={week.startDate} className="flex w-6 shrink-0 flex-col items-center gap-2">
                <div className="relative w-full flex-1">
                  <div
                    className="absolute bottom-0 w-full bg-accent-b"
                    style={{ height: `${Math.max((value / peak) * 100, 4)}%` }}
                    role="img"
                    aria-label={`${week.isoWeek}: ${formatNumber(value)}`}
                  />
                </div>
                <Typography variant="capsPole" tone="muted">
                  {String(week.isoWeek)}
                </Typography>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

/**
 * Топ по странам и сортам. Показываем не всё: длинный хвост из одной записи ничего не
 * рассказывает, а экран растягивает.
 */
function RankedShares({
  label,
  shares,
  format,
}: {
  label: string
  shares: readonly StatsShareDto[]
  format: (key: string) => string
}) {
  if (shares.length === 0) return null

  const visible = shares.slice(0, 8)

  return (
    <section className="grid gap-4">
      <Typography variant="capsLabel" tone="muted">
        {label}
      </Typography>

      <dl className="grid gap-3">
        {visible.map((share) => (
          <div key={share.key} className="grid gap-1">
            <div className="flex items-baseline justify-between gap-3">
              <Typography asChild variant="capsMeta" tone="muted">
                <dt className="min-w-0 truncate">{format(share.key)}</dt>
              </Typography>
              <Typography asChild variant="fieldValue">
                <dd>{`${Math.round(share.share * 100)}%`}</dd>
              </Typography>
            </div>
            <div className="h-2 w-full bg-border">
              <div
                className="h-full bg-accent-a"
                style={{ width: `${Math.max(share.share * 100, 2)}%` }}
              />
            </div>
          </div>
        ))}
      </dl>
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

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

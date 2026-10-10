import {
  tasteCategoryLabels,
  wineTypeLabels,
  type CategoryShareDto,
  type Locale,
  type TypeShareDto,
  type WeekMetricsDto,
  type WeekDayDto,
  type WineType,
} from '@between-bubbles/contracts'
import { useState } from 'react'

import { Typography } from '@/components/ui/typography'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/features/auth'
import { weekdayShortLabel } from '../weekdays'
import { FlavorChips } from './FlavorChips'

/**
 * Диаграммы недели (ТЗ §9).
 *
 * Собраны на SVG и CSS вместо готовой библиотеки: здесь три простых формы, зато нужен
 * полный контроль над зазорами между секторами, прямыми подписями и тем, чтобы всё
 * читалось на 360 px. Цвета — валидированный набор из `index.css`, а не акценты тегов.
 */

/** Цвет закреплён за типом: фильтр или другая неделя не должны перекрашивать сектор. */
const wineTypeFill: Record<WineType, string> = {
  WHITE: 'var(--wine-white)',
  RED: 'var(--wine-red)',
  ORANGE: 'var(--wine-orange)',
  ROSE: 'var(--wine-rose)',
  SPARKLING: 'var(--wine-sparkling)',
}

/** Порядок отрисовки: между красным и розовым обязано стоять оранжевое — рядом они неразличимы. */
const sectorOrder: readonly WineType[] = ['WHITE', 'RED', 'ORANGE', 'ROSE', 'SPARKLING']

export function WeekCharts({
  metrics,
  days,
  locale,
}: {
  metrics: WeekMetricsDto
  days: readonly WeekDayDto[]
  locale: Locale
}) {
  return (
    <div className="grid gap-8">
      <DailyBars days={days} locale={locale} />
      <WineTypePie distribution={metrics.typeDistribution} locale={locale} />
      <CategoryBars distribution={metrics.categoryDistribution} locale={locale} />
    </div>
  )
}

/** Столбцы по дням с переключателем «Вина / Бокалы» (ТЗ §9). */
function DailyBars({ days, locale }: { days: readonly WeekDayDto[]; locale: Locale }) {
  const { t } = useTranslation()
  const [measure, setMeasure] = useState<'entries' | 'glasses'>('entries')

  const values = days.map((day) => (measure === 'entries' ? day.entryCount : day.glasses))
  const peak = Math.max(...values, 1)

  return (
    <section className="grid gap-4">
      <Typography variant="capsLabel" tone="muted">
        {t('charts.byDay')}
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

      <div className="flex h-40 gap-2">
        {days.map((day, index) => {
          const value = values[index] ?? 0
          return (
            <div key={day.date} className="flex flex-1 flex-col items-center gap-2">
              <Typography variant="capsPole" tone="muted">
                {value === 0 ? ' ' : formatNumber(value)}
              </Typography>
              {/*
                Область построения обязана иметь собственную высоту: процент на самом
                столбце не к чему привязать, если у родителя высота по содержимому.
              */}
              <div className="relative w-full flex-1">
                <div
                  className={cn(
                    'absolute bottom-0 w-full',
                    value === 0 ? 'bg-border' : 'bg-accent-b',
                  )}
                  style={{ height: value === 0 ? '2px' : `${Math.max((value / peak) * 100, 6)}%` }}
                  role="img"
                  aria-label={`${weekdayShortLabel(day.weekday, locale)}: ${formatNumber(value)}`}
                />
              </div>
              <Typography variant="capsPole" tone="muted">
                {weekdayShortLabel(day.weekday, locale)}
              </Typography>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/** Круговая по типам вина: 5 фиксированных цветов, зазор в цвет поверхности между секторами. */
export function WineTypePie({
  distribution,
  locale,
}: {
  distribution: readonly TypeShareDto[]
  locale: Locale
}) {
  const { t } = useTranslation()
  const slices = sectorOrder
    .map((type) => distribution.find((share) => share.type === type))
    .filter((share): share is NonNullable<typeof share> => share !== undefined)

  if (slices.length === 0) return null

  // Углы считаем заранее, а не накапливаем переменную по ходу отрисовки:
  // мутация во время рендера — источник расхождений при повторных проходах React.
  const sectors = slices.reduce<Array<{ type: WineType; share: number; from: number; to: number }>>(
    (acc, slice) => {
      const from = acc.at(-1)?.to ?? -90
      return [...acc, { type: slice.type, share: slice.share, from, to: from + slice.share * 360 }]
    },
    [],
  )

  return (
    <section className="grid gap-4">
      <Typography variant="capsLabel" tone="muted">
        {t('charts.byType')}
      </Typography>

      <div className="flex items-center gap-6">
        <svg viewBox="0 0 100 100" className="h-32 w-32 shrink-0" role="img" aria-label={t('charts.byTypeAlt')}>
          {sectors.map((sector) => (
            <path
              key={sector.type}
              d={arcPath(50, 50, 46, sector.from, sector.to)}
              fill={wineTypeFill[sector.type]}
              // Зазор рисуем цветом поверхности, а не прозрачностью: под кругом фон страницы.
              stroke="var(--background)"
              strokeWidth={2}
            />
          ))}
        </svg>

        <dl className="grid flex-1 gap-2">
          {slices.map((slice) => (
            <div key={slice.type} className="flex items-center gap-2">
              <span
                aria-hidden
                className="h-3 w-3 shrink-0"
                style={{ backgroundColor: wineTypeFill[slice.type] }}
              />
              <Typography asChild variant="capsMeta" tone="muted">
                <dt className="flex-1">{wineTypeLabels[slice.type][locale]}</dt>
              </Typography>
              <Typography asChild variant="fieldValue">
                <dd>{`${Math.round(slice.share * 100)}%`}</dd>
              </Typography>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}

/**
 * Категории вкуса — горизонтальные полосы. Согласованное отступление от ТЗ §9,
 * где для них указана круговая диаграмма.
 *
 * Категорий семь вместе с «без категории», и семи различимых при дальтонизме оттенков
 * в земляной палитре проекта не набирается — проверено валидатором. Полосы сохраняют
 * смысл «доля от целого», но опознаются по подписи, а не по цвету.
 * Возвращать круговую не нужно: вариант с полосами принят заказчиком.
 */
export function CategoryBars({
  distribution,
  locale,
}: {
  distribution: readonly CategoryShareDto[]
  locale: Locale
}) {
  const { t } = useTranslation()
  if (distribution.length === 0) return null

  return (
    <section className="grid gap-4">
      <Typography variant="capsLabel" tone="muted">
        {t('charts.byCategory')}
      </Typography>

      <dl className="grid gap-3">
        {distribution.map((share) => (
          <div key={share.category ?? 'none'} className="grid gap-1">
            <div className="flex items-baseline justify-between gap-3">
              <Typography asChild variant="capsMeta" tone="muted">
                <dt className="min-w-0 truncate">
                  {share.category === null
                    ? t('charts.noCategory')
                    : `${share.category} — ${tasteCategoryLabels[share.category][locale]}`}
                </dt>
              </Typography>
              <Typography asChild variant="fieldValue">
                <dd>{`${Math.round(share.share * 100)}%`}</dd>
              </Typography>
            </div>
            <div className="h-2 w-full bg-border">
              <div
                className="h-full"
                style={{
                  width: `${Math.max(share.share * 100, 2)}%`,
                  backgroundColor:
                    share.category === null
                      ? 'var(--category-none)'
                      : 'var(--category-scale)',
                }}
              />
            </div>
          </div>
        ))}
      </dl>
    </section>
  )
}

/** Сектор круга как SVG-путь. Углы в градусах, 0° — вправо, отсчёт по часовой стрелке. */
function arcPath(cx: number, cy: number, r: number, from: number, to: number): string {
  // Полный круг нельзя описать дугой — он схлопнется в точку, поэтому рисуем окружность.
  if (to - from >= 359.99) {
    return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`
  }

  const start = polar(cx, cy, r, from)
  const end = polar(cx, cy, r, to)
  const largeArc = to - from > 180 ? 1 : 0

  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y} Z`
}

function polar(cx: number, cy: number, r: number, degrees: number) {
  const radians = (degrees * Math.PI) / 180
  return { x: cx + r * Math.cos(radians), y: cy + r * Math.sin(radians) }
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

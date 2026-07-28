import {
  GLASS_ML,
  type CategoryShareDto,
  type CurrencyTotalDto,
  type Currency,
  type TasteCategory,
  type TopEntryDto,
  type TypeShareDto,
  type WeekDayDto,
  type WeekMetricsDto,
  type WineType,
} from '@between-bubbles/contracts'

import { weekDates, weekday, type CalendarDate } from './calendar'

/**
 * Метрики недели (ТЗ §8.1). Всё считается на лету по активным записям недели;
 * кэша нет намеренно — при 100 записях это микросекунды.
 */
export type MetricEntry = {
  id: string
  wineId: string
  wineName: string
  wineType: WineType
  tastedOn: CalendarDate
  volumeMl: number
  rating: number
  price: number | null
  currency: Currency | null
  tasteCategory: TasteCategory | null
  /** Запись помечена как «та же бутылка» — её цена уже посчитана в исходной записи (ТЗ §7.4). */
  isSameBottleRepeat: boolean
}

/** Порядок фиксирован, чтобы цвет сектора на диаграмме не «прыгал» между неделями. */
const wineTypeOrder: readonly WineType[] = ['WHITE', 'RED', 'ROSE', 'ORANGE']
const tasteCategoryOrder: readonly TasteCategory[] = ['I', 'II', 'III', 'IV', 'V', 'VI']
const currencyOrder: readonly Currency[] = ['GEL', 'RUB', 'USD', 'EUR']

/** Бокалы во всех метриках = мл / 150, округление до 0.5 при отображении (ТЗ §7.2). */
export function glassesFromMl(volumeMl: number): number {
  return Math.round((volumeMl / GLASS_ML) * 2) / 2
}

export function totalMl(entries: readonly MetricEntry[]): number {
  return entries.reduce((sum, entry) => sum + entry.volumeMl, 0)
}

/** Топовое вино — только по рейтингу. При равенстве показываются все лидеры (ТЗ §8.1). */
export function topEntries(entries: readonly MetricEntry[]): TopEntryDto[] {
  if (entries.length === 0) return []

  const best = entries.reduce((max, entry) => Math.max(max, entry.rating), 0)

  return entries
    .filter((entry) => entry.rating === best)
    .sort((left, right) => left.tastedOn.localeCompare(right.tastedOn))
    .map((entry) => ({
      entryId: entry.id,
      wineId: entry.wineId,
      wineName: entry.wineName,
      wineType: entry.wineType,
      rating: entry.rating,
      tastedOn: entry.tastedOn,
    }))
}

/** Мода по категории вкуса среди записей, где она заполнена. При ничьей — все лидеры. */
export function topTasteCategories(entries: readonly MetricEntry[]): TasteCategory[] {
  const counts = new Map<TasteCategory, number>()
  for (const entry of entries) {
    if (entry.tasteCategory === null) continue
    counts.set(entry.tasteCategory, (counts.get(entry.tasteCategory) ?? 0) + 1)
  }

  if (counts.size === 0) return []

  const best = Math.max(...counts.values())
  return tasteCategoryOrder.filter((category) => counts.get(category) === best)
}

export function typeDistribution(entries: readonly MetricEntry[]): TypeShareDto[] {
  if (entries.length === 0) return []

  const counts = new Map<WineType, number>()
  for (const entry of entries) {
    counts.set(entry.wineType, (counts.get(entry.wineType) ?? 0) + 1)
  }

  return wineTypeOrder
    .filter((type) => counts.has(type))
    .map((type) => {
      const count = counts.get(type) ?? 0
      return { type, count, share: count / entries.length }
    })
}

/** Записи без категории идут в отдельный сегмент «Без категории» (ТЗ §8.1). */
export function categoryDistribution(entries: readonly MetricEntry[]): CategoryShareDto[] {
  if (entries.length === 0) return []

  const counts = new Map<TasteCategory | null, number>()
  for (const entry of entries) {
    counts.set(entry.tasteCategory, (counts.get(entry.tasteCategory) ?? 0) + 1)
  }

  const buckets: (TasteCategory | null)[] = [...tasteCategoryOrder, null]

  return buckets
    .filter((category) => counts.has(category))
    .map((category) => {
      const count = counts.get(category) ?? 0
      return { category, count, share: count / entries.length }
    })
}

/**
 * Траты по валютам. Валюты не смешиваются и не конвертируются, а записи-повторы
 * той же бутылки исключаются, чтобы бутылка не посчиталась дважды (ТЗ §7.4, §8.1).
 */
export function spendByCurrency(entries: readonly MetricEntry[]): CurrencyTotalDto[] {
  const totals = new Map<Currency, number>()

  for (const entry of entries) {
    if (entry.isSameBottleRepeat) continue
    if (entry.price === null || entry.currency === null) continue
    totals.set(entry.currency, (totals.get(entry.currency) ?? 0) + entry.price)
  }

  return currencyOrder
    .filter((currency) => totals.has(currency))
    .map((currency) => ({ currency, total: roundMoney(totals.get(currency) ?? 0) }))
}

/** Календарь недели: 7 ячеек, число иконок 🍷 = число записей этого дня (ТЗ §9). */
export function dayBreakdown(
  startDate: CalendarDate,
  entries: readonly MetricEntry[],
): WeekDayDto[] {
  return weekDates(startDate).map((date) => {
    const dayEntries = entries.filter((entry) => entry.tastedOn === date)
    return {
      date,
      weekday: weekday(date),
      entryCount: dayEntries.length,
      glasses: glassesFromMl(totalMl(dayEntries)),
    }
  })
}

export function weekMetrics(
  entries: readonly MetricEntry[],
  options: { showSpendTotals: boolean },
): WeekMetricsDto {
  const ml = totalMl(entries)

  return {
    totalEntries: entries.length,
    totalGlasses: glassesFromMl(ml),
    totalMl: ml,
    topEntries: topEntries(entries),
    topTasteCategories: topTasteCategories(entries),
    typeDistribution: typeDistribution(entries),
    categoryDistribution: categoryDistribution(entries),
    spendByCurrency: options.showSpendTotals ? spendByCurrency(entries) : null,
  }
}

/** Средний рейтинг считается только у конкретного вина по всем его дегустациям (ТЗ §8.2). */
export function averageWineRating(ratings: readonly number[]): number | null {
  if (ratings.length === 0) return null
  const sum = ratings.reduce((total, rating) => total + rating, 0)
  return Math.round((sum / ratings.length) * 100) / 100
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

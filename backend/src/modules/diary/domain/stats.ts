import {
  type StatsPeriod,
  type StatsShareDto,
  type StatsWeekPointDto,
  type TopWineDto,
  type WineType,
} from '@between-bubbles/contracts'

import { startOfWeek, weekBoundaries, type CalendarDate } from './calendar'
import { glassesFromMl, type MetricEntry } from './metrics'

/**
 * Статистика за период (ТЗ §10.9).
 *
 * Считается на лету теми же правилами, что и неделя: бокалы из миллилитров, средний рейтинг
 * только у конкретного вина, повторы той же бутылки не задваивают траты. Отдельного кеша нет —
 * при дневнике в тысячу записей это доли миллисекунды.
 */

/** Топ-5: больше в списке уже не читается, а ради «покажи все» есть экран «Мои вина». */
const TOP_WINE_LIMIT = 5

/** Запись глазами статистики: к метрикам недели добавляются страна и сорта. */
export type StatsEntry = MetricEntry & {
  originCountry: string | null
  grapes: readonly string[]
}

/**
 * Начало периода в календаре пользователя. У «всего времени» начала нет: оно определяется
 * первой записью, а её может не быть вовсе.
 */
export function statsPeriodStart(period: StatsPeriod, today: CalendarDate): CalendarDate | null {
  if (period === 'all') return null
  return period === 'month'
    ? (`${today.slice(0, 7)}-01` as CalendarDate)
    : (`${today.slice(0, 4)}-01-01` as CalendarDate)
}

export function topWines(entries: readonly StatsEntry[]): TopWineDto[] {
  const byWine = new Map<string, { name: string; type: WineType; ratings: number[] }>()

  for (const entry of entries) {
    const wine = byWine.get(entry.wineId) ?? {
      name: entry.wineName,
      type: entry.wineType,
      ratings: [],
    }
    wine.ratings.push(entry.rating)
    byWine.set(entry.wineId, wine)
  }

  return [...byWine.entries()]
    .map(([wineId, wine]) => ({
      wineId,
      name: wine.name,
      type: wine.type,
      averageRating: roundRating(
        wine.ratings.reduce((sum, rating) => sum + rating, 0) / wine.ratings.length,
      ),
      tastingCount: wine.ratings.length,
    }))
    .sort(
      (left, right) =>
        right.averageRating - left.averageRating ||
        // При равном рейтинге выше то вино, которое пробовали чаще: одна пятёрка наугад
        // и пять пятёрок подряд — разные основания для места в топе.
        right.tastingCount - left.tastingCount ||
        left.name.localeCompare(right.name),
    )
    .slice(0, TOP_WINE_LIMIT)
}

/** Распределение по странам происхождения. Записи без страны в расчёт не идут. */
export function countryDistribution(entries: readonly StatsEntry[]): StatsShareDto[] {
  return shares(
    entries.flatMap((entry) => (entry.originCountry === null ? [] : [entry.originCountry])),
  )
}

/**
 * Распределение по сортам. У бленда несколько сортов, и каждый считается отдельно, поэтому
 * доли берутся от числа упоминаний, а не от числа записей — иначе сумма ушла бы за сто процентов.
 */
export function grapeDistribution(entries: readonly StatsEntry[]): StatsShareDto[] {
  return shares(entries.flatMap((entry) => [...entry.grapes]))
}

/** Динамика по неделям: только недели с записями, от старых к новым. */
export function weeklyDynamics(entries: readonly StatsEntry[]): StatsWeekPointDto[] {
  const byWeek = new Map<CalendarDate, { entryCount: number; volumeMl: number }>()

  for (const entry of entries) {
    const start = startOfWeek(entry.tastedOn)
    const point = byWeek.get(start) ?? { entryCount: 0, volumeMl: 0 }
    point.entryCount += 1
    point.volumeMl += entry.volumeMl
    byWeek.set(start, point)
  }

  return [...byWeek.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([startDate, point]) => {
      const { isoYear, isoWeek } = weekBoundaries(startDate)
      return {
        startDate,
        isoYear,
        isoWeek,
        entryCount: point.entryCount,
        glasses: glassesFromMl(point.volumeMl),
      }
    })
}

function shares(keys: readonly string[]): StatsShareDto[] {
  if (keys.length === 0) return []

  const counts = new Map<string, number>()
  for (const key of keys) {
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return [...counts.entries()]
    .map(([key, count]) => ({ key, count, share: count / keys.length }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key))
}

function roundRating(value: number): number {
  return Math.round(value * 100) / 100
}

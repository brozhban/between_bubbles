import { describe, expect, test } from 'bun:test'

import type { CalendarDate } from './calendar'
import {
  countryDistribution,
  grapeDistribution,
  statsPeriodStart,
  topWines,
  weeklyDynamics,
  type StatsEntry,
} from './stats'

function entry(overrides: Partial<StatsEntry> = {}): StatsEntry {
  return {
    id: 'entry-1',
    wineId: 'wine-1',
    wineName: 'Saperavi',
    wineType: 'RED',
    tastedOn: '2026-07-22' as CalendarDate,
    volumeMl: 150,
    rating: 4,
    price: null,
    currency: null,
    tasteCategory: null,
    isSameBottleRepeat: false,
    originCountry: 'GE',
    grapes: ['Саперави'],
    ...overrides,
  }
}

describe('stats period (ТЗ §10.9)', () => {
  test('месяц и год отсчитываются от календарной границы, у «всего времени» границы нет', () => {
    expect(statsPeriodStart('month', '2026-07-28' as CalendarDate)).toBe('2026-07-01')
    expect(statsPeriodStart('year', '2026-07-28' as CalendarDate)).toBe('2026-01-01')
    expect(statsPeriodStart('all', '2026-07-28' as CalendarDate)).toBeNull()
  })
})

describe('top wines (ТЗ §10.9)', () => {
  test('рейтинг вина усредняется по его дегустациям, а не берётся из записи', () => {
    const [top] = topWines([
      entry({ id: 'a', rating: 5 }),
      entry({ id: 'b', rating: 4 }),
    ])

    expect(top).toMatchObject({ wineId: 'wine-1', averageRating: 4.5, tastingCount: 2 })
  })

  test('при равном рейтинге выше то вино, которое пробовали чаще', () => {
    const wines = topWines([
      entry({ id: 'a', wineId: 'once', wineName: 'Once', rating: 5 }),
      entry({ id: 'b', wineId: 'twice', wineName: 'Twice', rating: 5 }),
      entry({ id: 'c', wineId: 'twice', wineName: 'Twice', rating: 5 }),
    ])

    expect(wines.map((wine) => wine.wineId)).toEqual(['twice', 'once'])
  })

  test('в топ попадают пять вин, а не пять записей', () => {
    const entries = Array.from({ length: 8 }, (_, index) =>
      entry({
        id: `entry-${index}`,
        wineId: `wine-${index}`,
        wineName: `Wine ${index}`,
        rating: 1 + index * 0.5,
      }),
    )

    const wines = topWines(entries)
    expect(wines).toHaveLength(5)
    expect(wines[0]?.wineId).toBe('wine-7')
  })
})

describe('distributions (ТЗ §10.9)', () => {
  test('страны считаются только у записей, где страна указана', () => {
    const shares = countryDistribution([
      entry({ originCountry: 'GE' }),
      entry({ originCountry: 'GE' }),
      entry({ originCountry: 'FR' }),
      entry({ originCountry: null }),
    ])

    expect(shares).toEqual([
      { key: 'GE', count: 2, share: 2 / 3 },
      { key: 'FR', count: 1, share: 1 / 3 },
    ])
  })

  test('у бленда считается каждый сорт, поэтому доли берутся от упоминаний', () => {
    const shares = grapeDistribution([
      entry({ grapes: ['Саперави', 'Ркацители'] }),
      entry({ grapes: ['Саперави'] }),
    ])

    expect(shares).toEqual([
      { key: 'Саперави', count: 2, share: 2 / 3 },
      { key: 'Ркацители', count: 1, share: 1 / 3 },
    ])
    // Доли в сумме дают единицу — иначе диаграмма показала бы больше ста процентов.
    expect(shares.reduce((sum, share) => sum + share.share, 0)).toBeCloseTo(1)
  })
})

describe('weekly dynamics (ТЗ §10.9)', () => {
  test('записи группируются по неделям Пн–Вс и идут от старых к новым', () => {
    const points = weeklyDynamics([
      // Воскресенье и понедельник рядом по датам, но это разные недели.
      entry({ id: 'sunday', tastedOn: '2026-07-26' as CalendarDate, volumeMl: 150 }),
      entry({ id: 'monday', tastedOn: '2026-07-27' as CalendarDate, volumeMl: 300 }),
      entry({ id: 'tuesday', tastedOn: '2026-07-28' as CalendarDate, volumeMl: 150 }),
    ])

    expect(points).toEqual([
      { startDate: '2026-07-20', isoYear: 2026, isoWeek: 30, entryCount: 1, glasses: 1 },
      { startDate: '2026-07-27', isoYear: 2026, isoWeek: 31, entryCount: 2, glasses: 3 },
    ])
  })

  test('недели без записей в динамику не попадают', () => {
    expect(weeklyDynamics([])).toEqual([])
  })
})

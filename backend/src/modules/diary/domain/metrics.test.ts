import { describe, expect, test } from 'bun:test'

import {
  averageWineRating,
  categoryDistribution,
  dayBreakdown,
  glassesFromMl,
  spendByCurrency,
  topEntries,
  topTasteCategories,
  totalMl,
  typeDistribution,
  weekMetrics,
  type MetricEntry,
} from './metrics'

let sequence = 0

function entry(overrides: Partial<MetricEntry> = {}): MetricEntry {
  sequence += 1
  return {
    id: `entry-${sequence}`,
    wineId: `wine-${sequence}`,
    wineName: `Wine ${sequence}`,
    wineType: 'RED',
    tastedOn: '2026-07-20',
    volumeMl: 150,
    rating: 4,
    price: null,
    currency: null,
    tasteCategory: null,
    isSameBottleRepeat: false,
    ...overrides,
  }
}

describe('glassesFromMl', () => {
  test('converts millilitres to glasses of 150 ml, rounded to 0.5', () => {
    expect(glassesFromMl(150)).toBe(1)
    expect(glassesFromMl(750)).toBe(5)
    expect(glassesFromMl(0)).toBe(0)
    expect(glassesFromMl(225)).toBe(1.5)
    expect(glassesFromMl(100)).toBe(0.5)
    expect(glassesFromMl(200)).toBe(1.5)
  })
})

describe('totalMl', () => {
  test('sums the volume of every active entry', () => {
    expect(totalMl([entry({ volumeMl: 150 }), entry({ volumeMl: 750 })])).toBe(900)
    expect(totalMl([])).toBe(0)
  })
})

describe('topEntries', () => {
  test('returns every leader when ratings tie, ordered by tasting date', () => {
    const later = entry({ rating: 5, tastedOn: '2026-07-24', wineName: 'Later' })
    const earlier = entry({ rating: 5, tastedOn: '2026-07-21', wineName: 'Earlier' })
    const lower = entry({ rating: 4.5, tastedOn: '2026-07-22' })

    const result = topEntries([later, lower, earlier])

    expect(result.map((item) => item.wineName)).toEqual(['Earlier', 'Later'])
    expect(result.every((item) => item.rating === 5)).toBe(true)
  })

  test('is empty when the week has no entries', () => {
    expect(topEntries([])).toEqual([])
  })

  test('ignores anything but the rating when picking the leader', () => {
    const cheapAndBest = entry({ rating: 5, price: 8, currency: 'GEL' })
    const expensive = entry({ rating: 4, price: 200, currency: 'GEL' })

    expect(topEntries([expensive, cheapAndBest]).map((item) => item.entryId)).toEqual([
      cheapAndBest.id,
    ])
  })
})

describe('topTasteCategories', () => {
  test('returns the single most frequent category', () => {
    expect(
      topTasteCategories([
        entry({ tasteCategory: 'III' }),
        entry({ tasteCategory: 'III' }),
        entry({ tasteCategory: 'I' }),
      ]),
    ).toEqual(['III'])
  })

  test('returns all leaders on a tie', () => {
    expect(
      topTasteCategories([
        entry({ tasteCategory: 'VI' }),
        entry({ tasteCategory: 'II' }),
        entry({ tasteCategory: 'II' }),
        entry({ tasteCategory: 'VI' }),
      ]),
    ).toEqual(['II', 'VI'])
  })

  test('is empty when no entry has a category', () => {
    expect(topTasteCategories([entry(), entry()])).toEqual([])
    expect(topTasteCategories([])).toEqual([])
  })
})

describe('typeDistribution', () => {
  test('reports shares only for types present in the week', () => {
    const result = typeDistribution([
      entry({ wineType: 'RED' }),
      entry({ wineType: 'RED' }),
      entry({ wineType: 'ORANGE' }),
      entry({ wineType: 'WHITE' }),
      entry({ wineType: 'SPARKLING' }),
    ])

    expect(result).toEqual([
      { type: 'WHITE', count: 1, share: 0.2 },
      { type: 'RED', count: 2, share: 0.4 },
      { type: 'ORANGE', count: 1, share: 0.2 },
      { type: 'SPARKLING', count: 1, share: 0.2 },
    ])
  })

  test('renders a single entry as one full sector', () => {
    expect(typeDistribution([entry({ wineType: 'ROSE' })])).toEqual([
      { type: 'ROSE', count: 1, share: 1 },
    ])
  })
})

describe('categoryDistribution', () => {
  test('puts entries without a category into their own bucket, last', () => {
    const result = categoryDistribution([
      entry({ tasteCategory: 'IV' }),
      entry({ tasteCategory: null }),
      entry({ tasteCategory: null }),
      entry({ tasteCategory: 'I' }),
    ])

    expect(result).toEqual([
      { category: 'I', count: 1, share: 0.25 },
      { category: 'IV', count: 1, share: 0.25 },
      { category: null, count: 2, share: 0.5 },
    ])
  })
})

describe('spendByCurrency', () => {
  test('keeps currencies separate and never converts between them', () => {
    expect(
      spendByCurrency([
        entry({ price: 30, currency: 'GEL' }),
        entry({ price: 12.5, currency: 'GEL' }),
        entry({ price: 20, currency: 'EUR' }),
      ]),
    ).toEqual([
      { currency: 'GEL', total: 42.5 },
      { currency: 'EUR', total: 20 },
    ])
  })

  test('counts the same bottle once, even when it is finished on another day', () => {
    const bottle = entry({ price: 40, currency: 'GEL' })
    const leftovers = entry({ price: 40, currency: 'GEL', isSameBottleRepeat: true })

    expect(spendByCurrency([bottle, leftovers])).toEqual([{ currency: 'GEL', total: 40 }])
  })

  test('skips entries without a price and hides currencies with no spend', () => {
    expect(spendByCurrency([entry(), entry({ price: null, currency: 'USD' })])).toEqual([])
  })
})

describe('dayBreakdown', () => {
  test('returns seven cells with the entry count of each day', () => {
    const days = dayBreakdown('2026-07-20', [
      entry({ tastedOn: '2026-07-20', volumeMl: 150 }),
      entry({ tastedOn: '2026-07-20', volumeMl: 300 }),
      entry({ tastedOn: '2026-07-26', volumeMl: 750 }),
    ])

    expect(days).toHaveLength(7)
    expect(days[0]).toEqual({
      date: '2026-07-20',
      weekday: 1,
      entryCount: 2,
      glasses: 3,
    })
    expect(days[3]).toEqual({
      date: '2026-07-23',
      weekday: 4,
      entryCount: 0,
      glasses: 0,
    })
    expect(days[6]).toEqual({
      date: '2026-07-26',
      weekday: 7,
      entryCount: 1,
      glasses: 5,
    })
  })
})

describe('weekMetrics', () => {
  test('hides spend totals unless the user turned them on', () => {
    const entries = [entry({ price: 30, currency: 'GEL' })]

    expect(weekMetrics(entries, { showSpendTotals: false }).spendByCurrency).toBeNull()
    expect(weekMetrics(entries, { showSpendTotals: true }).spendByCurrency).toEqual([
      { currency: 'GEL', total: 30 },
    ])
  })

  test('reports an empty week as all zeroes without leaders', () => {
    const metrics = weekMetrics([], { showSpendTotals: true })

    expect(metrics.totalEntries).toBe(0)
    expect(metrics.totalGlasses).toBe(0)
    expect(metrics.totalMl).toBe(0)
    expect(metrics.topEntries).toEqual([])
    expect(metrics.topTasteCategories).toEqual([])
    expect(metrics.typeDistribution).toEqual([])
    expect(metrics.categoryDistribution).toEqual([])
    expect(metrics.spendByCurrency).toEqual([])
  })
})

describe('averageWineRating', () => {
  test('averages all tastings of one wine and rounds to two decimals', () => {
    expect(averageWineRating([4, 5])).toBe(4.5)
    expect(averageWineRating([4, 4.5, 5])).toBe(4.5)
    expect(averageWineRating([3, 4, 4])).toBe(3.67)
  })

  test('is null for a wine that has no tastings left', () => {
    expect(averageWineRating([])).toBeNull()
  })
})

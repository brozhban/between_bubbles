import { describe, expect, test } from 'bun:test'

import {
  ageOn,
  entryCreateSchema,
  isAdultOn,
  isoDateSchema,
  ratingSchema,
  volumeMlSchema,
  wineInputSchema,
} from './index'

const baseEntry = {
  wine: { mode: 'new' as const, wine: { name: 'Saperavi', type: 'RED' as const } },
  tastedOn: '2026-07-20',
  volumeMl: 150,
  rating: 4.5,
}

describe('rating scale', () => {
  test('accepts the ten allowed half-steps and nothing else', () => {
    const allowed = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]
    for (const value of allowed) {
      expect(ratingSchema.parse(value)).toBe(value)
    }

    expect(() => ratingSchema.parse(0)).toThrow()
    expect(() => ratingSchema.parse(0.25)).toThrow()
    expect(() => ratingSchema.parse(3.7)).toThrow()
    expect(() => ratingSchema.parse(5.5)).toThrow()
  })
})

describe('volume', () => {
  test('stores millilitres as whole numbers', () => {
    expect(volumeMlSchema.parse(750)).toBe(750)
    expect(() => volumeMlSchema.parse(0)).toThrow()
    expect(() => volumeMlSchema.parse(120.5)).toThrow()
  })
})

describe('entry payload', () => {
  test('requires a currency whenever a price is given', () => {
    expect(() => entryCreateSchema.parse({ ...baseEntry, price: 25 })).toThrow()

    const parsed = entryCreateSchema.parse({ ...baseEntry, price: 25, currency: 'GEL' })
    expect(parsed.price).toBe(25)
    expect(parsed.currency).toBe('GEL')
  })

  test('allows an entry with no price at all', () => {
    const parsed = entryCreateSchema.parse(baseEntry)
    expect(parsed.price).toBeUndefined()
    expect(parsed.currency).toBeUndefined()
    expect(parsed.aromaTagIds).toEqual([])
  })

  test('accepts a repeat of an existing wine by id', () => {
    const parsed = entryCreateSchema.parse({
      ...baseEntry,
      wine: { mode: 'existing', wineId: '0198c0f0-0000-7000-8000-000000000001' },
    })

    expect(parsed.wine).toEqual({
      mode: 'existing',
      wineId: '0198c0f0-0000-7000-8000-000000000001',
    })
  })

  test('rejects a malformed tasting date', () => {
    expect(() => entryCreateSchema.parse({ ...baseEntry, tastedOn: '2026-02-30' })).toThrow()
    expect(() => entryCreateSchema.parse({ ...baseEntry, tastedOn: '20.07.2026' })).toThrow()
  })
})

describe('wine input', () => {
  test('normalizes empty optional text to undefined and defaults grapes', () => {
    const parsed = wineInputSchema.parse({ name: '  Saperavi  ', type: 'RED', producer: '' })

    expect(parsed.name).toBe('Saperavi')
    expect(parsed.producer).toBeUndefined()
    expect(parsed.grapes).toEqual([])
  })

  test('requires a name and a type', () => {
    expect(() => wineInputSchema.parse({ name: '', type: 'RED' })).toThrow()
    expect(() => wineInputSchema.parse({ name: 'Saperavi' })).toThrow()
  })
})

describe('age gate', () => {
  test('counts age by calendar date, not by year difference', () => {
    expect(ageOn('2008-07-23', '2026-07-22')).toBe(17)
    expect(ageOn('2008-07-22', '2026-07-22')).toBe(18)
    expect(isAdultOn('2008-07-23', '2026-07-22')).toBe(false)
    expect(isAdultOn('2008-07-22', '2026-07-22')).toBe(true)
  })
})

describe('iso date', () => {
  test('rejects dates that do not exist', () => {
    expect(isoDateSchema.parse('2024-02-29')).toBe('2024-02-29')
    expect(() => isoDateSchema.parse('2025-02-29')).toThrow()
    expect(() => isoDateSchema.parse('2026-13-01')).toThrow()
  })
})

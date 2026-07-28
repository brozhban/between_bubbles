import { describe, expect, test } from 'bun:test'

import {
  addDays,
  isFutureDate,
  startOfWeek,
  todayIn,
  weekBoundaries,
  weekDates,
  weekday,
} from './calendar'

describe('weekday', () => {
  test('numbers Monday to Sunday as 1..7', () => {
    expect(weekday('2026-07-20')).toBe(1)
    expect(weekday('2026-07-22')).toBe(3)
    expect(weekday('2026-07-26')).toBe(7)
  })
})

describe('startOfWeek', () => {
  test('snaps every day of a week back to its Monday', () => {
    for (const date of weekDates('2026-07-20')) {
      expect(startOfWeek(date)).toBe('2026-07-20')
    }
  })

  test('treats Sunday as the end of the week, not the start', () => {
    expect(startOfWeek('2026-07-26')).toBe('2026-07-20')
    expect(startOfWeek('2026-07-27')).toBe('2026-07-27')
  })
})

describe('weekBoundaries', () => {
  test('returns a Monday-to-Sunday range with its ISO week number', () => {
    expect(weekBoundaries('2026-07-22')).toEqual({
      startDate: '2026-07-20',
      endDate: '2026-07-26',
      isoYear: 2026,
      isoWeek: 30,
    })
  })

  test('keeps the ISO year of the week, not of the calendar day, across a year boundary', () => {
    // 1 января 2026 — четверг, поэтому 29 декабря 2025 уже относится к первой неделе 2026 года.
    expect(weekBoundaries('2025-12-29')).toEqual({
      startDate: '2025-12-29',
      endDate: '2026-01-04',
      isoYear: 2026,
      isoWeek: 1,
    })

    // 1 января 2027 — пятница, поэтому эта неделя ещё принадлежит 2026 году.
    expect(weekBoundaries('2027-01-01')).toEqual({
      startDate: '2026-12-28',
      endDate: '2027-01-03',
      isoYear: 2026,
      isoWeek: 53,
    })
  })

  test('handles a leap day', () => {
    expect(weekBoundaries('2024-02-29')).toEqual({
      startDate: '2024-02-26',
      endDate: '2024-03-03',
      isoYear: 2024,
      isoWeek: 9,
    })
  })
})

describe('addDays', () => {
  test('crosses month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('todayIn', () => {
  test('resolves the calendar day in the user timezone, not in UTC', () => {
    // 22:30 UTC — в Тбилиси (+4) уже следующие сутки, в Нью-Йорке (−4) ещё те же.
    const now = new Date('2026-07-22T22:30:00.000Z')

    expect(todayIn('Asia/Tbilisi', now)).toBe('2026-07-23')
    expect(todayIn('America/New_York', now)).toBe('2026-07-22')
    expect(todayIn('UTC', now)).toBe('2026-07-22')
  })
})

describe('isFutureDate', () => {
  test('allows today and rejects tomorrow in the user timezone', () => {
    const now = new Date('2026-07-22T22:30:00.000Z')

    expect(isFutureDate('2026-07-23', 'Asia/Tbilisi', now)).toBe(false)
    expect(isFutureDate('2026-07-24', 'Asia/Tbilisi', now)).toBe(true)
    expect(isFutureDate('2026-07-23', 'America/New_York', now)).toBe(true)
  })
})

import { describe, expect, test } from 'bun:test'

import { ianaTimezoneSchema } from './common'

describe('ianaTimezoneSchema', () => {
  test('accepts zones the runtime can actually format with', () => {
    for (const timezone of ['Asia/Tbilisi', 'Europe/Moscow', 'UTC', 'America/New_York']) {
      expect(ianaTimezoneSchema.parse(timezone)).toBe(timezone)
    }
  })

  test('rejects a zone that would break every date calculation', () => {
    // Границы недель считаются через Intl с этой зоной (ТЗ §6). Неизвестное значение
    // роняло неделю, статистику и создание записей в 500 — и починить это пользователь
    // уже не мог: экран настроек ломался тем же способом.
    for (const timezone of ['Nope/Nowhere', 'Europe/Атлантида', 'GMT+25']) {
      expect(() => ianaTimezoneSchema.parse(timezone)).toThrow()
    }
  })

  test('still rejects empty and oversized values', () => {
    expect(() => ianaTimezoneSchema.parse('')).toThrow()
    expect(() => ianaTimezoneSchema.parse('x'.repeat(65))).toThrow()
  })
})

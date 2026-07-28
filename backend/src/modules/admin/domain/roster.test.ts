import { describe, expect, test } from 'bun:test'

import { createAdminRoster } from './roster'

describe('admin roster (ТЗ §2)', () => {
  test('без списка администраторов нет вовсе', () => {
    expect(createAdminRoster(undefined).includes('anyone@example.com')).toBe(false)
    expect(createAdminRoster('').includes('anyone@example.com')).toBe(false)
  })

  test('список читается через запятую и не зависит от пробелов и регистра', () => {
    const roster = createAdminRoster(' Admin@Example.com , second@example.com ')

    expect(roster.includes('admin@example.com')).toBe(true)
    expect(roster.includes('ADMIN@EXAMPLE.COM')).toBe(true)
    expect(roster.includes('second@example.com')).toBe(true)
    expect(roster.includes('third@example.com')).toBe(false)
  })

  test('пустые элементы списка никого не делают администратором', () => {
    const roster = createAdminRoster('admin@example.com,,')

    expect(roster.includes('')).toBe(false)
    expect(roster.includes('   ')).toBe(false)
  })
})

import { describe, expect, test } from 'bun:test'
import { registerRequestSchema } from '@between-bubbles/contracts'

describe('contracts', () => {
  test('normalizes auth registration payloads', () => {
    const result = registerRequestSchema.parse({
      email: ' USER@Example.COM ',
      password: 'quiet-cellar-42',
      displayName: '',
      birthDate: '1990-01-01',
      acceptedTermsVersion: '2026-07-01',
    })

    expect(result).toEqual({
      email: 'user@example.com',
      password: 'quiet-cellar-42',
      displayName: undefined,
      birthDate: '1990-01-01',
      timezone: 'Asia/Tbilisi',
      locale: 'ru',
      acceptedTermsVersion: '2026-07-01',
    })
  })
})

import { describe, expect, test } from 'bun:test'
import { registerRequestSchema } from '@between-bubbles/contracts'
import { CURRENT_TERMS_VERSION } from '@between-bubbles/contracts'

describe('contracts', () => {
  test('normalizes auth registration payloads', () => {
    const result = registerRequestSchema.parse({
      email: ' USER@Example.COM ',
      password: 'quiet-cellar-42',
      displayName: '',
      birthDate: '1990-01-01',
      acceptedTermsVersion: CURRENT_TERMS_VERSION,
    })

    expect(result).toEqual({
      email: 'user@example.com',
      password: 'quiet-cellar-42',
      displayName: undefined,
      birthDate: '1990-01-01',
      timezone: 'Asia/Tbilisi',
      locale: 'ru',
      acceptedTermsVersion: CURRENT_TERMS_VERSION,
    })
  })
})

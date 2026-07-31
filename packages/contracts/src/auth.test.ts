import { describe, expect, test } from 'bun:test'

import {
  apiErrorSchema,
  cookieAuthResponseSchema,
  cookieLogoutRequestSchema,
  cookieRefreshRequestSchema,
  cookieRefreshResponseSchema,
  loginRequestSchema,
  meResponseSchema,
  registerRequestSchema,
  tokenAuthResponseSchema,
  tokenLogoutRequestSchema,
  tokenRefreshRequestSchema,
  tokenRefreshResponseSchema,
  type UserDto,
} from './index'
import { CURRENT_TERMS_VERSION } from './legal'

const validUser: UserDto = {
  id: 'user_1',
  email: 'user@example.com',
  displayName: null,
  locale: 'ru',
  theme: 'system',
  timezone: 'Asia/Tbilisi',
  defaultCurrency: 'GEL',
  showSpendTotals: false,
  avatarUrl: null,
  emailVerified: false,
  isAdmin: false,
  createdAt: '2026-05-11T00:00:00.000Z',
}

const adultBirthDate = '1990-01-01'

describe('auth contracts', () => {
  test('normalizes registration and login input', () => {
    expect(
      registerRequestSchema.parse({
        email: ' USER@Example.COM ',
        password: 'quiet-cellar-42',
        displayName: ' Jane ',
        birthDate: adultBirthDate,
        timezone: 'Europe/Berlin',
        acceptedTermsVersion: CURRENT_TERMS_VERSION,
      }),
    ).toEqual({
      email: 'user@example.com',
      password: 'quiet-cellar-42',
      displayName: 'Jane',
      birthDate: adultBirthDate,
      timezone: 'Europe/Berlin',
      locale: 'ru',
      acceptedTermsVersion: CURRENT_TERMS_VERSION,
    })

    expect(
      registerRequestSchema.parse({
        email: 'user@example.com',
        password: 'quiet-cellar-42',
        displayName: '',
        birthDate: adultBirthDate,
        acceptedTermsVersion: CURRENT_TERMS_VERSION,
      }),
    ).toEqual({
      email: 'user@example.com',
      password: 'quiet-cellar-42',
      displayName: undefined,
      birthDate: adultBirthDate,
      timezone: 'Asia/Tbilisi',
      locale: 'ru',
      acceptedTermsVersion: CURRENT_TERMS_VERSION,
    })

    expect(
      loginRequestSchema.parse({
        email: ' USER@Example.COM ',
        password: 'quiet-cellar-42',
      }),
    ).toEqual({
      email: 'user@example.com',
      password: 'quiet-cellar-42',
    })
  })

  test('rejects invalid auth request payloads', () => {
    expect(() =>
      registerRequestSchema.parse({
        email: 'not-an-email',
        password: 'short',
        displayName: 'A',
        birthDate: adultBirthDate,
        acceptedTermsVersion: CURRENT_TERMS_VERSION,
      }),
    ).toThrow()

    expect(() =>
      loginRequestSchema.parse({
        email: 'user@example.com',
        password: 'short',
      }),
    ).toThrow()
  })

  test('blocks registration under 18 and without an accepted terms version', () => {
    const under18 = new Date()
    under18.setUTCFullYear(under18.getUTCFullYear() - 17)

    expect(() =>
      registerRequestSchema.parse({
        email: 'user@example.com',
        password: 'quiet-cellar-42',
        birthDate: under18.toISOString().slice(0, 10),
        acceptedTermsVersion: CURRENT_TERMS_VERSION,
      }),
    ).toThrow()

    expect(() =>
      registerRequestSchema.parse({
        email: 'user@example.com',
        password: 'quiet-cellar-42',
        birthDate: adultBirthDate,
      }),
    ).toThrow()
  })

  test('keeps cookie requests empty and requires explicit token transport credentials', () => {
    expect(cookieRefreshRequestSchema.parse(undefined)).toEqual({})
    expect(cookieRefreshRequestSchema.parse({})).toEqual({})
    expect(cookieLogoutRequestSchema.parse(undefined)).toEqual({})
    expect(cookieLogoutRequestSchema.parse({})).toEqual({})

    const refreshToken = 'r'.repeat(32)
    expect(tokenRefreshRequestSchema.parse({ refreshToken })).toEqual({ refreshToken })
    expect(tokenLogoutRequestSchema.parse({ refreshToken })).toEqual({ refreshToken })

    expect(() => cookieRefreshRequestSchema.parse({ refreshToken })).toThrow()
    expect(() => cookieLogoutRequestSchema.parse({ refreshToken })).toThrow()
    expect(() => tokenRefreshRequestSchema.parse({})).toThrow()
    expect(() => tokenLogoutRequestSchema.parse({ refreshToken: 'short' })).toThrow()
  })

  test('keeps cookie responses token-free and requires tokens for explicit token transport', () => {
    expect(
      cookieAuthResponseSchema.parse({
        user: validUser,
        accessToken: 'access-token',
      }),
    ).toEqual({
      user: validUser,
      accessToken: 'access-token',
    })

    expect(() =>
      cookieAuthResponseSchema.parse({
        user: validUser,
        accessToken: 'access-token',
        refreshToken: 'must-not-be-exposed',
      }),
    ).toThrow()

    expect(
      tokenAuthResponseSchema.parse({
        user: validUser,
        accessToken: 'access-token',
        refreshToken: 'token-transport-refresh-token',
      }),
    ).toEqual({
      user: validUser,
      accessToken: 'access-token',
      refreshToken: 'token-transport-refresh-token',
    })

    expect(() => tokenAuthResponseSchema.parse({ user: validUser, accessToken: 'access-token' })).toThrow()
    expect(cookieRefreshResponseSchema.parse({ accessToken: 'access-token' })).toEqual({
      accessToken: 'access-token',
    })
    expect(
      tokenRefreshResponseSchema.parse({
        accessToken: 'access-token',
        refreshToken: 'token-transport-refresh-token',
      }),
    ).toEqual({
      accessToken: 'access-token',
      refreshToken: 'token-transport-refresh-token',
    })
    expect(meResponseSchema.parse({ user: validUser })).toEqual({ user: validUser })
  })

  test('validates stable API error response shape', () => {
    expect(
      apiErrorSchema.parse({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request payload',
          details: [{ path: ['email'], message: 'Invalid email address' }],
        },
      }),
    ).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request payload',
        details: [{ path: ['email'], message: 'Invalid email address' }],
      },
    })

    expect(() =>
      apiErrorSchema.parse({
        error: {
          code: 'SOMETHING_ELSE',
          message: 'Nope',
        },
      }),
    ).toThrow()
  })
})

test('login accepts a password that the leak list would reject at registration', () => {
  // Правило про утёкшие пароли принадлежит регистрации и смене пароля. На входе оно
  // работало бы против уже зарегистрированных: пополнение списка заперло бы их снаружи,
  // а починить это они смогли бы только восстановлением пароля.
  const leaked = 'password2024'
  expect(() =>
    registerRequestSchema.parse({
      email: 'user@example.com',
      password: leaked,
      birthDate: '1990-01-01',
      acceptedTermsVersion: CURRENT_TERMS_VERSION,
    }),
  ).toThrow()

  expect(loginRequestSchema.parse({ email: 'user@example.com', password: leaked })).toMatchObject({
    password: leaked,
  })
})

test('registration accepts only a published terms version', () => {
  const payload = {
    email: 'user@example.com',
    password: 'quiet-cellar-42',
    birthDate: '1990-01-01',
  }

  expect(() =>
    registerRequestSchema.parse({ ...payload, acceptedTermsVersion: CURRENT_TERMS_VERSION }),
  ).not.toThrow()

  // Запись «принял версию smoke» юридически не значит ничего: такой редакции не было.
  expect(() =>
    registerRequestSchema.parse({ ...payload, acceptedTermsVersion: 'smoke' }),
  ).toThrow()
  expect(() =>
    registerRequestSchema.parse({ ...payload, acceptedTermsVersion: '2019-01-01' }),
  ).toThrow()
})

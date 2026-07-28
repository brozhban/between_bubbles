import { afterAll, beforeEach, describe, expect, test } from 'bun:test'

import { createApp } from '../../app'
import { createPrisma } from '../../db'
import type { AppEnv } from '../../env'

const databaseUrl = process.env.TEST_DATABASE_URL

const maybeDescribe = databaseUrl ? describe : describe.skip

maybeDescribe('profile API integration', () => {
  const env: AppEnv = {
    PORT: 3000,
    DATABASE_URL: databaseUrl!,
    JWT_SECRET: '12345678901234567890123456789012',
    CORS_ORIGINS: ['http://localhost:5173'],
    ACCESS_TOKEN_TTL_SECONDS: 60,
    REFRESH_TOKEN_TTL_DAYS: 30,
    REFRESH_REUSE_GRACE_SECONDS: 10,
    SESSION_ABSOLUTE_TTL_DAYS: 90,
    SESSION_RETENTION_DAYS: 7,
    AUTH_BODY_LIMIT_BYTES: 64 * 1024,
    AUTH_RATE_LIMIT_MAX: 60,
    AUTH_RATE_LIMIT_WINDOW_SECONDS: 60,
    SHUTDOWN_GRACE_SECONDS: 20,
    TRUST_PROXY: false,
    COOKIE_SECURE: false,
    SPACES_UPLOAD_MAX_BYTES: 10 * 1024 * 1024,
    SPACES_UPLOAD_URL_TTL_SECONDS: 900,
    SPACES_DOWNLOAD_URL_TTL_SECONDS: 300,
    SPACES_PUBLIC_CACHE_CONTROL: 'public, max-age=31536000, immutable',
  }
  const prisma = createPrisma(databaseUrl!)
  const app = createApp({ env, prisma })

  beforeEach(async () => {
    await prisma.tastingEntry.deleteMany()
    await prisma.week.deleteMany()
    await prisma.wine.deleteMany()
    await prisma.aromaTag.deleteMany()
    await prisma.authSession.deleteMany()
    await prisma.user.deleteMany()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  async function registerUser(email: string) {
    const response = await app.request('/api/auth/token/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'quiet-cellar-42',
        birthDate: '1990-01-01',
        acceptedTermsVersion: '2026-07-01',
      }),
    })
    const body = await response.json()
    expect(response.status).toBe(201)

    return { accessToken: body.accessToken as string, userId: body.user.id as string }
  }

  function authed(accessToken: string, init: RequestInit = {}): RequestInit {
    return {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        ...(init.headers ?? {}),
      },
    }
  }

  test('updates settings and reflects them in the session user', async () => {
    const user = await registerUser('settings@example.com')

    const response = await app.request(
      '/api/profile',
      authed(user.accessToken, {
        method: 'PATCH',
        body: JSON.stringify({
          displayName: 'Елена',
          locale: 'en',
          theme: 'dark',
          timezone: 'Europe/Berlin',
          defaultCurrency: 'EUR',
          showSpendTotals: true,
        }),
      }),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.user).toMatchObject({
      displayName: 'Елена',
      locale: 'en',
      theme: 'dark',
      timezone: 'Europe/Berlin',
      defaultCurrency: 'EUR',
      showSpendTotals: true,
    })

    const me = await app.request('/api/auth/me', authed(user.accessToken))
    expect((await me.json()).user.timezone).toBe('Europe/Berlin')
  })

  test('clears the display name when an empty string is sent', async () => {
    const user = await registerUser('noname@example.com')

    await app.request(
      '/api/profile',
      authed(user.accessToken, {
        method: 'PATCH',
        body: JSON.stringify({ displayName: 'Временное' }),
      }),
    )
    const cleared = await app.request(
      '/api/profile',
      authed(user.accessToken, {
        method: 'PATCH',
        body: JSON.stringify({ displayName: '' }),
      }),
    )

    expect((await cleared.json()).user.displayName).toBeNull()
  })

  test('turning spend totals on makes week metrics expose them', async () => {
    const user = await registerUser('spend@example.com')
    await app.request(
      '/api/entries',
      authed(user.accessToken, {
        method: 'POST',
        body: JSON.stringify({
          wine: { mode: 'new', wine: { name: 'Saperavi', type: 'RED' } },
          tastedOn: '2026-07-22',
          volumeMl: 150,
          rating: 4,
          price: 30,
          currency: 'GEL',
        }),
      }),
    )

    const hidden = await app.request('/api/week?date=2026-07-22', authed(user.accessToken))
    expect((await hidden.json()).metrics.spendByCurrency).toBeNull()

    await app.request(
      '/api/profile',
      authed(user.accessToken, {
        method: 'PATCH',
        body: JSON.stringify({ showSpendTotals: true }),
      }),
    )

    const shown = await app.request('/api/week?date=2026-07-22', authed(user.accessToken))
    expect((await shown.json()).metrics.spendByCurrency).toEqual([{ currency: 'GEL', total: 30 }])
  })

  test('rejects an empty patch and an unauthenticated request', async () => {
    const user = await registerUser('guard@example.com')

    const empty = await app.request(
      '/api/profile',
      authed(user.accessToken, { method: 'PATCH', body: JSON.stringify({}) }),
    )
    expect(empty.status).toBe(400)

    const anonymous = await app.request('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: 'dark' }),
    })
    expect(anonymous.status).toBe(401)
  })
})

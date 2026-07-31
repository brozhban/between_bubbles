import { afterAll, beforeEach, describe, expect, test } from 'bun:test'

import { createApp } from '../../app'
import { createPrisma } from '../../db'
import type { AppEnv } from '../../env'
import { CURRENT_TERMS_VERSION } from '@between-bubbles/contracts'

const databaseUrl = process.env.TEST_DATABASE_URL

const maybeDescribe = databaseUrl ? describe : describe.skip

maybeDescribe('sharing API integration', () => {
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
    PUBLIC_BACKEND_URL: 'https://api.example.com',
    SPACES_UPLOAD_MAX_BYTES: 10 * 1024 * 1024,
    SPACES_UPLOAD_URL_TTL_SECONDS: 900,
    SPACES_DOWNLOAD_URL_TTL_SECONDS: 300,
    SPACES_PUBLIC_CACHE_CONTROL: 'public, max-age=31536000, immutable',
  }
  const prisma = createPrisma(databaseUrl!)
  const app = createApp({ env, prisma })

  beforeEach(async () => {
    await prisma.shareLink.deleteMany()
    await prisma.tastingEntry.deleteMany()
    await prisma.week.deleteMany()
    await prisma.wine.deleteMany()
    await prisma.authSession.deleteMany()
    await prisma.user.deleteMany()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  async function registerUser(email: string, displayName = 'Елена') {
    const response = await app.request('/api/auth/token/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        displayName,
        password: 'quiet-cellar-42',
        birthDate: '1990-01-01',
        acceptedTermsVersion: CURRENT_TERMS_VERSION,
      }),
    })
    expect(response.status).toBe(201)
    return (await response.json()).accessToken as string
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

  async function createEntry(accessToken: string) {
    const response = await app.request(
      '/api/entries',
      authed(accessToken, {
        method: 'POST',
        body: JSON.stringify({
          wine: {
            mode: 'new',
            wine: { name: 'Saperavi Reserve', type: 'RED', originCountry: 'GE' },
          },
          tastedOn: '2026-07-22',
          volumeMl: 150,
          rating: 4.5,
          price: 60,
          currency: 'GEL',
          notes: 'Тёмная вишня',
          tasteCategory: 'VI',
          store: { mode: 'new', name: 'Goodwill', countryCode: 'GE' },
        }),
      }),
    )
    expect(response.status).toBe(201)
    return (await response.json()).entry
  }

  const share = (accessToken: string, entryId: string, body: unknown = {}) =>
    app.request(
      `/api/entries/${entryId}/share`,
      authed(accessToken, { method: 'POST', body: JSON.stringify(body) }),
    )

  test('published page shows the wine but never the price, the store, or the email', async () => {
    const token = await registerUser('share@example.com')
    const entry = await createEntry(token)

    const created = await share(token, entry.id)
    const link = await created.json()
    expect(created.status).toBe(201)
    expect(link.url).toBe(`https://api.example.com/w/${link.slug}`)
    expect(link.showName).toBe(false)

    const page = await app.request(`/w/${link.slug}`)
    const html = await page.text()

    expect(page.status).toBe(200)
    expect(page.headers.get('content-type')).toContain('text/html')
    expect(html).toContain('Saperavi Reserve')
    expect(html).toContain('4.5')
    expect(html).toContain('Тёмная вишня')

    // Состав публикации по ТЗ §12: денег, магазина и почты на странице быть не должно.
    // Смотрим разметку без стилей — в CSS цифры встречаются законно (`max-height:60vh`).
    const markup = html.slice(html.indexOf('</style>'))
    expect(markup).not.toContain('60')
    expect(markup).not.toContain('GEL')
    expect(markup).not.toContain('Goodwill')
    expect(markup).not.toContain('share@example.com')
    // Имя автора выключено по умолчанию.
    expect(markup).not.toContain('Елена')
  })

  test('author name appears only after the toggle is turned on', async () => {
    const token = await registerUser('with-name@example.com')
    const entry = await createEntry(token)
    const link = await (await share(token, entry.id)).json()

    const updated = await app.request(
      `/api/entries/${entry.id}/share`,
      authed(token, { method: 'PATCH', body: JSON.stringify({ showName: true }) }),
    )
    expect(updated.status).toBe(200)
    expect((await updated.json()).slug).toBe(link.slug)

    const html = await (await app.request(`/w/${link.slug}`)).text()
    expect(html).toContain('Елена')
  })

  test('sharing twice keeps one link so an already sent address stays alive', async () => {
    const token = await registerUser('stable@example.com')
    const entry = await createEntry(token)

    const first = await (await share(token, entry.id)).json()
    const second = await (await share(token, entry.id)).json()

    expect(second.slug).toBe(first.slug)
    expect(await prisma.shareLink.count()).toBe(1)
  })

  test('revoked link answers 404 exactly like a link that never existed', async () => {
    const token = await registerUser('revoke@example.com')
    const entry = await createEntry(token)
    const link = await (await share(token, entry.id)).json()

    const revoked = await app.request(
      `/api/entries/${entry.id}/share`,
      authed(token, { method: 'DELETE' }),
    )
    expect(revoked.status).toBe(204)

    const page = await app.request(`/w/${link.slug}`)
    const nonsense = await app.request('/w/this-slug-never-existed')

    expect(page.status).toBe(404)
    expect(nonsense.status).toBe(404)
    expect(await page.text()).toBe(await nonsense.text())

    // Ссылки на записи больше нет, и «поделиться» заново выдаёт новый адрес.
    const again = await (await share(token, entry.id)).json()
    expect(again.slug).not.toBe(link.slug)
  })

  test('an entry moved to the trash stops being published', async () => {
    const token = await registerUser('trashed@example.com')
    const entry = await createEntry(token)
    const link = await (await share(token, entry.id)).json()

    await app.request(`/api/entries/${entry.id}`, authed(token, { method: 'DELETE' }))

    expect((await app.request(`/w/${link.slug}`)).status).toBe(404)
  })

  test('never lets one user publish or revoke another user entry', async () => {
    const owner = await registerUser('owner-share@example.com')
    const stranger = await registerUser('stranger-share@example.com')
    const entry = await createEntry(owner)

    expect((await share(stranger, entry.id)).status).toBe(404)

    await share(owner, entry.id)
    const revoke = await app.request(
      `/api/entries/${entry.id}/share`,
      authed(stranger, { method: 'DELETE' }),
    )
    expect(revoke.status).toBe(404)

    const read = await app.request(`/api/entries/${entry.id}/share`, authed(stranger))
    expect(await read.json()).toEqual({ share: null })
  })
})

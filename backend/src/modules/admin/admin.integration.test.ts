import { afterAll, beforeEach, describe, expect, test } from 'bun:test'

import { createApp } from '../../app'
import { createPrisma } from '../../db'
import type { AppEnv } from '../../env'

const databaseUrl = process.env.TEST_DATABASE_URL

const maybeDescribe = databaseUrl ? describe : describe.skip

maybeDescribe('admin API integration', () => {
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
    ADMIN_EMAILS: 'admin@example.com',
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
    await prisma.userStoreRecent.deleteMany()
    await prisma.store.deleteMany()
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
    expect(response.status).toBe(201)
    const body = await response.json()
    return { accessToken: body.accessToken as string, user: body.user }
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

  /** Магазин заводится так же, как его заводит человек: вместе с записью о дегустации. */
  async function createEntryWithStore(accessToken: string, storeName: string) {
    const response = await app.request(
      '/api/entries',
      authed(accessToken, {
        method: 'POST',
        body: JSON.stringify({
          wine: { mode: 'new', wine: { name: `Wine from ${storeName}`, type: 'RED' } },
          tastedOn: '2026-07-22',
          volumeMl: 150,
          rating: 4,
          store: { mode: 'new', name: storeName, countryCode: 'GE' },
        }),
      }),
    )
    expect(response.status).toBe(201)
    return (await response.json()).entry
  }

  test('marks only listed emails as administrators', async () => {
    const admin = await registerUser('admin@example.com')
    const user = await registerUser('user@example.com')

    expect(admin.user.isAdmin).toBe(true)
    expect(user.user.isAdmin).toBe(false)
  })

  test('hides the admin routes from everyone else behind a plain 404', async () => {
    const user = await registerUser('user@example.com')

    const list = await app.request('/api/admin/stores', authed(user.accessToken))
    expect(list.status).toBe(404)
    // Ровно то же тело, что у несуществующего маршрута: админка себя не выдаёт.
    expect(await list.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'Route not found' } })

    const anonymous = await app.request('/api/admin/stores')
    expect(anonymous.status).toBe(401)
  })

  test('merges a duplicate into the master and relinks its entries', async () => {
    const admin = await registerUser('admin@example.com')
    const user = await registerUser('user@example.com')
    const duplicateEntry = await createEntryWithStore(user.accessToken, 'Goodwill 1')
    const masterEntry = await createEntryWithStore(admin.accessToken, 'Goodwill')

    const merged = await app.request(
      `/api/admin/stores/${duplicateEntry.store.id}/merge`,
      authed(admin.accessToken, {
        method: 'POST',
        body: JSON.stringify({ targetId: masterEntry.store.id }),
      }),
    )
    expect(merged.status).toBe(200)
    expect((await merged.json()).usageCount).toBe(2)

    // Запись пользователя теперь показывает мастер, а не строку, которой больше нет в выдаче.
    const entry = await app.request(`/api/entries/${duplicateEntry.id}`, authed(user.accessToken))
    expect((await entry.json()).entry.store.name).toBe('Goodwill')

    // Дубль остался в базе помеченным, а в подсказках его больше нет (ТЗ §5.2).
    const duplicate = await prisma.store.findUniqueOrThrow({
      where: { id: duplicateEntry.store.id },
    })
    expect(duplicate.status).toBe('MERGED')
    expect(duplicate.mergedIntoId).toBe(masterEntry.store.id)

    const suggestions = await app.request('/api/stores?q=goodwill', authed(user.accessToken))
    const found = await suggestions.json()
    const names = [...found.recent, ...found.matches].map((store: { name: string }) => store.name)
    expect([...new Set(names)]).toEqual(['Goodwill'])
  })

  test('refuses to merge a store into itself or into a merged one', async () => {
    const admin = await registerUser('admin@example.com')
    const first = await createEntryWithStore(admin.accessToken, 'Duplicate')
    const second = await createEntryWithStore(admin.accessToken, 'Master')

    const intoItself = await app.request(
      `/api/admin/stores/${first.store.id}/merge`,
      authed(admin.accessToken, {
        method: 'POST',
        body: JSON.stringify({ targetId: first.store.id }),
      }),
    )
    expect(intoItself.status).toBe(400)

    await app.request(
      `/api/admin/stores/${first.store.id}/merge`,
      authed(admin.accessToken, {
        method: 'POST',
        body: JSON.stringify({ targetId: second.store.id }),
      }),
    )

    const intoMerged = await app.request(
      `/api/admin/stores/${second.store.id}/merge`,
      authed(admin.accessToken, {
        method: 'POST',
        body: JSON.stringify({ targetId: first.store.id }),
      }),
    )
    expect(intoMerged.status).toBe(400)
  })

  test('hidden store disappears from suggestions but stays in the old entry', async () => {
    const admin = await registerUser('admin@example.com')
    const user = await registerUser('user@example.com')
    const entry = await createEntryWithStore(user.accessToken, 'Мусорный магазин')

    const hidden = await app.request(
      `/api/admin/stores/${entry.store.id}`,
      authed(admin.accessToken, { method: 'PATCH', body: JSON.stringify({ status: 'HIDDEN' }) }),
    )
    expect(hidden.status).toBe(200)
    expect((await hidden.json()).status).toBe('HIDDEN')

    const suggestions = await app.request('/api/stores?q=мусорный', authed(user.accessToken))
    const found = await suggestions.json()
    expect([...found.recent, ...found.matches]).toEqual([])

    // Старая запись не теряет магазин: скрытие убирает его из будущих подсказок, не из истории.
    const saved = await app.request(`/api/entries/${entry.id}`, authed(user.accessToken))
    expect((await saved.json()).entry.store.name).toBe('Мусорный магазин')

    const restored = await app.request(
      `/api/admin/stores/${entry.store.id}`,
      authed(admin.accessToken, { method: 'PATCH', body: JSON.stringify({ status: 'ACTIVE' }) }),
    )
    expect((await restored.json()).status).toBe('ACTIVE')
  })

  test('lists stores for moderation with their real usage', async () => {
    const admin = await registerUser('admin@example.com')
    await createEntryWithStore(admin.accessToken, 'Winery Shop')

    const list = await app.request('/api/admin/stores?search=winery', authed(admin.accessToken))
    const { items } = await list.json()

    expect(list.status).toBe(200)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ name: 'Winery Shop', status: 'ACTIVE', entryCount: 1 })
  })
})

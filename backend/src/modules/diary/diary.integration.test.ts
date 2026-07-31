import { afterAll, beforeEach, describe, expect, test } from 'bun:test'

import { createApp } from '../../app'
import { createPrisma } from '../../db'
import type { AppEnv } from '../../env'
import { CURRENT_TERMS_VERSION } from '@between-bubbles/contracts'

const databaseUrl = process.env.TEST_DATABASE_URL

const maybeDescribe = databaseUrl ? describe : describe.skip

maybeDescribe('diary API integration', () => {
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

  // Даты фиксированные и заведомо в прошлом: запись в будущем сервер отклоняет (ТЗ §6).
  const monday = '2026-07-20'
  const wednesday = '2026-07-22'

  beforeEach(async () => {
    await prisma.tastingEntry.deleteMany()
    await prisma.week.deleteMany()
    await prisma.wine.deleteMany()
    await prisma.aromaTag.deleteMany()
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
        acceptedTermsVersion: CURRENT_TERMS_VERSION,
      }),
    })
    const body = await response.json()
    expect(response.status).toBe(201)

    return {
      accessToken: body.accessToken as string,
      userId: body.user.id as string,
    }
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

  async function createEntry(
    accessToken: string,
    overrides: Record<string, unknown> = {},
  ) {
    const response = await app.request(
      '/api/entries',
      authed(accessToken, {
        method: 'POST',
        body: JSON.stringify({
          wine: { mode: 'new', wine: { name: 'Saperavi', type: 'RED' } },
          tastedOn: wednesday,
          volumeMl: 150,
          rating: 4.5,
          ...overrides,
        }),
      }),
    )
    const body = await response.json()
    expect(response.status).toBe(201)

    return body.entry
  }

  describe('user isolation', () => {
    test('hides another user entry behind 404 on every entry route', async () => {
      const owner = await registerUser('owner@example.com')
      const stranger = await registerUser('stranger@example.com')
      const entry = await createEntry(owner.accessToken)

      const routes: Array<[string, RequestInit]> = [
        [`/api/entries/${entry.id}`, { method: 'GET' }],
        [
          `/api/entries/${entry.id}`,
          { method: 'PATCH', body: JSON.stringify({ rating: 1 }) },
        ],
        [`/api/entries/${entry.id}`, { method: 'DELETE' }],
        [`/api/entries/${entry.id}/restore`, { method: 'POST' }],
        [`/api/entries/${entry.id}/permanent`, { method: 'DELETE' }],
      ]

      for (const [path, init] of routes) {
        const response = await app.request(path, authed(stranger.accessToken, init))
        expect(response.status).toBe(404)
      }

      // Запись владельца при этом осталась нетронутой.
      const ownerRead = await app.request(
        `/api/entries/${entry.id}`,
        authed(owner.accessToken),
      )
      expect(ownerRead.status).toBe(200)
    })

    test('hides another user wine behind 404', async () => {
      const owner = await registerUser('wine-owner@example.com')
      const stranger = await registerUser('wine-stranger@example.com')
      const entry = await createEntry(owner.accessToken)

      const read = await app.request(
        `/api/wines/${entry.wine.id}`,
        authed(stranger.accessToken),
      )
      expect(read.status).toBe(404)

      const removed = await app.request(
        `/api/wines/${entry.wine.id}`,
        authed(stranger.accessToken, { method: 'DELETE' }),
      )
      expect(removed.status).toBe(404)
    })

    test('refuses to attach another user wine or entry to a new entry', async () => {
      const owner = await registerUser('ref-owner@example.com')
      const stranger = await registerUser('ref-stranger@example.com')
      const entry = await createEntry(owner.accessToken)

      const foreignWine = await app.request(
        '/api/entries',
        authed(stranger.accessToken, {
          method: 'POST',
          body: JSON.stringify({
            wine: { mode: 'existing', wineId: entry.wine.id },
            tastedOn: wednesday,
            volumeMl: 150,
            rating: 4,
          }),
        }),
      )
      expect(foreignWine.status).toBe(404)

      const foreignBottle = await app.request(
        '/api/entries',
        authed(stranger.accessToken, {
          method: 'POST',
          body: JSON.stringify({
            wine: { mode: 'new', wine: { name: 'Rkatsiteli', type: 'WHITE' } },
            tastedOn: wednesday,
            volumeMl: 150,
            rating: 4,
            sameBottleOfId: entry.id,
          }),
        }),
      )
      expect(foreignBottle.status).toBe(404)
    })

    test('keeps weeks, wine lists and trash scoped to their owner', async () => {
      const owner = await registerUser('scope-owner@example.com')
      const stranger = await registerUser('scope-stranger@example.com')
      await createEntry(owner.accessToken)

      const week = await app.request(
        `/api/week?date=${wednesday}`,
        authed(stranger.accessToken),
      )
      const weekBody = await week.json()
      expect(week.status).toBe(200)
      expect(weekBody.entries).toEqual([])
      expect(weekBody.weekId).toBeNull()
      expect(weekBody.metrics).toBeNull()

      const wines = await app.request('/api/wines', authed(stranger.accessToken))
      expect((await wines.json()).items).toEqual([])

      const trash = await app.request('/api/trash', authed(stranger.accessToken))
      expect((await trash.json()).items).toEqual([])
    })

    test('requires authentication on diary routes', async () => {
      const response = await app.request(`/api/week?date=${wednesday}`)
      expect(response.status).toBe(401)
    })
  })

  describe('weeks', () => {
    test('creates the week on the first entry and computes its metrics', async () => {
      const user = await registerUser('week@example.com')

      const empty = await app.request(`/api/week?date=${wednesday}`, authed(user.accessToken))
      const emptyBody = await empty.json()
      expect(emptyBody.weekId).toBeNull()
      expect(emptyBody.startDate).toBe(monday)
      expect(emptyBody.isoWeek).toBe(30)
      expect(emptyBody.metrics).toBeNull()
      expect(emptyBody.days).toHaveLength(7)

      await createEntry(user.accessToken, { volumeMl: 300, rating: 5, tasteCategory: 'III' })

      const filled = await app.request(`/api/week?date=${wednesday}`, authed(user.accessToken))
      const filledBody = await filled.json()

      expect(filledBody.weekId).not.toBeNull()
      expect(filledBody.metrics.totalEntries).toBe(1)
      expect(filledBody.metrics.totalGlasses).toBe(2)
      expect(filledBody.metrics.totalMl).toBe(300)
      expect(filledBody.metrics.topEntries).toHaveLength(1)
      expect(filledBody.metrics.topTasteCategories).toEqual(['III'])
      expect(filledBody.days[2].entryCount).toBe(1)
    })

    test('moves an entry to another week when its date changes', async () => {
      const user = await registerUser('move@example.com')
      const entry = await createEntry(user.accessToken)

      const previousWeekDate = '2026-07-15'
      const moved = await app.request(
        `/api/entries/${entry.id}`,
        authed(user.accessToken, {
          method: 'PATCH',
          body: JSON.stringify({ tastedOn: previousWeekDate }),
        }),
      )
      expect(moved.status).toBe(200)

      const sourceWeek = await app.request(
        `/api/week?date=${wednesday}`,
        authed(user.accessToken),
      )
      const sourceBody = await sourceWeek.json()
      expect(sourceBody.entries).toEqual([])
      // Опустевшая неделя не остаётся мусорной строкой в БД (ТЗ §6).
      expect(sourceBody.weekId).toBeNull()

      const targetWeek = await app.request(
        `/api/week?date=${previousWeekDate}`,
        authed(user.accessToken),
      )
      const targetBody = await targetWeek.json()
      expect(targetBody.entries).toHaveLength(1)
      expect(targetBody.startDate).toBe('2026-07-13')
    })

    test('rejects a tasting date in the future', async () => {
      const user = await registerUser('future@example.com')
      const tomorrow = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().slice(0, 10)

      const response = await app.request(
        '/api/entries',
        authed(user.accessToken, {
          method: 'POST',
          body: JSON.stringify({
            wine: { mode: 'new', wine: { name: 'Future', type: 'RED' } },
            tastedOn: tomorrow,
            volumeMl: 150,
            rating: 4,
          }),
        }),
      )

      expect(response.status).toBe(400)
    })
  })

  describe('same bottle', () => {
    test('counts a bottle once even when it is finished on another day', async () => {
      const user = await registerUser('bottle@example.com')
      const settings = { showSpendTotals: true }
      await prisma.user.update({ where: { id: user.userId }, data: settings })

      const first = await createEntry(user.accessToken, {
        price: 40,
        currency: 'GEL',
        volumeMl: 450,
      })
      await createEntry(user.accessToken, {
        wine: { mode: 'existing', wineId: first.wine.id },
        tastedOn: '2026-07-23',
        volumeMl: 300,
        rating: 4.5,
        price: 40,
        currency: 'GEL',
        sameBottleOfId: first.id,
      })

      // Профиль перечитывается на каждом запросе, поэтому переключатель трат работает
      // сразу, без перевыпуска access-токена.
      const week = await app.request(`/api/week?date=${wednesday}`, authed(user.accessToken))
      const body = await week.json()

      expect(body.metrics.totalEntries).toBe(2)
      expect(body.metrics.totalMl).toBe(750)
      expect(body.metrics.spendByCurrency).toEqual([{ currency: 'GEL', total: 40 }])
    })
  })

  describe('trash', () => {
    test('moves an entry to trash, hides it from the week, and restores it', async () => {
      const user = await registerUser('trash@example.com')
      const entry = await createEntry(user.accessToken)

      const deleted = await app.request(
        `/api/entries/${entry.id}`,
        authed(user.accessToken, { method: 'DELETE' }),
      )
      expect(deleted.status).toBe(200)

      const week = await app.request(`/api/week?date=${wednesday}`, authed(user.accessToken))
      expect((await week.json()).entries).toEqual([])

      const trash = await app.request('/api/trash', authed(user.accessToken))
      const trashBody = await trash.json()
      expect(trashBody.items).toHaveLength(1)
      expect(trashBody.items[0].id).toBe(entry.id)

      const restored = await app.request(
        `/api/entries/${entry.id}/restore`,
        authed(user.accessToken, { method: 'POST' }),
      )
      expect(restored.status).toBe(200)

      const restoredWeek = await app.request(
        `/api/week?date=${wednesday}`,
        authed(user.accessToken),
      )
      expect((await restoredWeek.json()).entries).toHaveLength(1)
    })
  })

  describe('stores', () => {
    test('suggests an existing store for a typo that substring search would miss', async () => {
      const user = await registerUser('stores@example.com')

      const created = await app.request(
        '/api/stores',
        authed(user.accessToken, {
          method: 'POST',
          body: JSON.stringify({
            name: 'Goodwill',
            countryCode: 'GE',
            city: 'Тбилиси',
            kind: 'SUPERMARKET',
          }),
        }),
      )
      expect(created.status).toBe(201)

      const search = await app.request(
        '/api/stores?q=Godwill&country=GE',
        authed(user.accessToken),
      )
      const body = await search.json()

      // Подстрочный поиск опечатку не находит — и именно поэтому нужен нечёткий слой.
      expect(body.matches).toEqual([])
      expect(body.duplicateSuggestion?.name).toBe('Goodwill')
    })

    test('does not suggest an unrelated store', async () => {
      const user = await registerUser('stores-miss@example.com')
      await app.request(
        '/api/stores',
        authed(user.accessToken, {
          method: 'POST',
          body: JSON.stringify({ name: 'Goodwill', countryCode: 'GE' }),
        }),
      )

      const search = await app.request(
        '/api/stores?q=Carrefour&country=GE',
        authed(user.accessToken),
      )
      expect((await search.json()).duplicateSuggestion).toBeNull()
    })

    test('rejects a store name that looks like spam', async () => {
      const user = await registerUser('stores-spam@example.com')

      const response = await app.request(
        '/api/stores',
        authed(user.accessToken, {
          method: 'POST',
          body: JSON.stringify({ name: 'buy at http://spam.example', countryCode: 'GE' }),
        }),
      )
      expect(response.status).toBe(400)
    })
  })

  describe('wines', () => {
    test('refuses to delete a wine that still has tastings', async () => {
      const user = await registerUser('catalogue@example.com')
      const entry = await createEntry(user.accessToken)

      const blocked = await app.request(
        `/api/wines/${entry.wine.id}`,
        authed(user.accessToken, { method: 'DELETE' }),
      )
      expect(blocked.status).toBe(409)

      await app.request(
        `/api/entries/${entry.id}`,
        authed(user.accessToken, { method: 'DELETE' }),
      )
      await app.request(
        `/api/entries/${entry.id}/permanent`,
        authed(user.accessToken, { method: 'DELETE' }),
      )

      const removed = await app.request(
        `/api/wines/${entry.wine.id}`,
        authed(user.accessToken, { method: 'DELETE' }),
      )
      expect(removed.status).toBe(200)
    })

    test('counts statistics only over the owner entries and the chosen period (ТЗ §10.9)', async () => {
      const owner = await registerUser('stats@example.com')
      const stranger = await registerUser('stats-stranger@example.com')
      await createEntry(owner.accessToken, {
        wine: {
          mode: 'new',
          wine: { name: 'Saperavi', type: 'RED', originCountry: 'GE', grapes: ['Саперави'] },
        },
        volumeMl: 300,
        rating: 5,
      })
      await createEntry(stranger.accessToken, {
        wine: { mode: 'new', wine: { name: 'Not Mine', type: 'WHITE' } },
        rating: 4,
      })

      const stats = await app.request('/api/stats?period=all', authed(owner.accessToken))
      const body = await stats.json()

      expect(stats.status).toBe(200)
      expect(body.totalEntries).toBe(1)
      expect(body.totalGlasses).toBe(2)
      expect(body.topWines).toHaveLength(1)
      expect(body.topWines[0]).toMatchObject({ name: 'Saperavi', averageRating: 5, tastingCount: 1 })
      expect(body.countryDistribution).toEqual([{ key: 'GE', count: 1, share: 1 }])
      expect(body.grapeDistribution).toEqual([{ key: 'Саперави', count: 1, share: 1 }])
      expect(body.weeks).toHaveLength(1)
      // Траты скрыты, пока пользователь не включил их в настройках (ТЗ §8.1).
      expect(body.spendByCurrency).toBeNull()

      // Запись сделана в июле 2026; в статистике «этого месяца» её быть не должно,
      // потому что тест идёт в другом календарном месяце — кроме самого июля.
      const month = await app.request('/api/stats?period=month', authed(owner.accessToken))
      const monthBody = await month.json()
      const isSameMonth = monthBody.startDate.slice(0, 7) === wednesday.slice(0, 7)
      expect(monthBody.totalEntries).toBe(isSameMonth ? 1 : 0)
    })

    test('exports only the owner active entries, in both formats (ТЗ §14)', async () => {
      const owner = await registerUser('export@example.com')
      const stranger = await registerUser('not-in-export@example.com')
      await createEntry(owner.accessToken, {
        wine: { mode: 'new', wine: { name: 'Saperavi Reserve', type: 'RED' } },
        notes: 'Вишня, дым',
      })
      const trashed = await createEntry(owner.accessToken, {
        wine: { mode: 'new', wine: { name: 'Trashed Wine', type: 'WHITE' } },
      })
      await app.request(`/api/entries/${trashed.id}`, authed(owner.accessToken, { method: 'DELETE' }))
      await createEntry(stranger.accessToken, {
        wine: { mode: 'new', wine: { name: 'Stranger Wine', type: 'ROSE' } },
      })

      const csv = await app.request('/api/export?format=csv', authed(owner.accessToken))
      expect(csv.status).toBe(200)
      expect(csv.headers.get('content-type')).toContain('text/csv')
      expect(csv.headers.get('content-disposition')).toContain('attachment; filename="between-bubbles-')
      const csvText = await csv.text()
      expect(csvText).toContain('Saperavi Reserve')
      // Заметка с запятой осталась одним полем, а чужие и удалённые записи не попали в файл.
      expect(csvText).toContain('"Вишня, дым"')
      expect(csvText).not.toContain('Trashed Wine')
      expect(csvText).not.toContain('Stranger Wine')

      const json = await app.request('/api/export?format=json', authed(owner.accessToken))
      const parsed = await json.json()
      expect(json.headers.get('content-type')).toContain('application/json')
      expect(parsed.entryCount).toBe(1)
      expect(parsed.entries[0].wine.name).toBe('Saperavi Reserve')
    })

    test('refuses to export anything without a session', async () => {
      const response = await app.request('/api/export?format=csv')
      expect(response.status).toBe(401)
    })

    test('averages the rating of one wine across all of its tastings', async () => {
      const user = await registerUser('average@example.com')
      const first = await createEntry(user.accessToken, { rating: 4 })
      await createEntry(user.accessToken, {
        wine: { mode: 'existing', wineId: first.wine.id },
        tastedOn: '2026-07-21',
        rating: 5,
      })

      const wine = await app.request(
        `/api/wines/${first.wine.id}`,
        authed(user.accessToken),
      )
      const body = await wine.json()

      expect(body.averageRating).toBe(4.5)
      expect(body.tastings).toHaveLength(2)
    })
  })
})

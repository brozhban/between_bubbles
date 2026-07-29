import { afterAll, beforeEach, describe, expect, test } from 'bun:test'

import { createApp } from '../../app'
import { createPrisma } from '../../db'
import type { AppEnv } from '../../env'
import { BackupService, type BackupStorage } from './index'

const databaseUrl = process.env.TEST_DATABASE_URL

const maybeDescribe = databaseUrl ? describe : describe.skip

/**
 * Проверка не «копия создалась», а «из копии восстанавливается рабочий дневник» (ТЗ §13).
 * Бэкап, который никто не разворачивал, — это надежда, а не резервная копия.
 */
maybeDescribe('database backup integration', () => {
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

  /** Хранилище в памяти: проверяем сам механизм копии, а не доступность облака. */
  function createMemoryStorage(): BackupStorage & { objects: Map<string, Uint8Array> } {
    const objects = new Map<string, Uint8Array>()

    return {
      objects,
      async put({ key, bytes }) {
        objects.set(key, bytes)
      },
      async get(key) {
        const bytes = objects.get(key)
        if (!bytes) throw new Error(`Backup ${key} not found`)
        return bytes
      },
      async list(prefix) {
        return [...objects.keys()].filter((key) => key.startsWith(prefix))
      },
      async delete(key) {
        objects.delete(key)
      },
    }
  }

  async function wipeDatabase() {
    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE
        auth_sessions, auth_tokens, share_links, user_store_recents, entry_photos,
        entry_aromas, tasting_entries, wines, weeks, stores, aroma_tags, users
      RESTART IDENTITY CASCADE
    `)
  }

  beforeEach(wipeDatabase)

  afterAll(async () => {
    await prisma.$disconnect()
  })

  async function seedDiary() {
    const register = await app.request('/api/auth/token/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'backup@example.com',
        displayName: 'Backup',
        password: 'quiet-cellar-42',
        birthDate: '1990-01-01',
        acceptedTermsVersion: '2026-07-01',
      }),
    })
    const { accessToken } = await register.json()

    const entry = await app.request('/api/entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        wine: {
          mode: 'new',
          wine: { name: 'Saperavi', type: 'RED', grapes: ['Саперави'], vintage: 2021, abv: 13.5 },
        },
        tastedOn: '2026-07-22',
        volumeMl: 150,
        rating: 4.5,
        price: 60,
        currency: 'GEL',
        notes: 'Заметка с «кавычками» и переносом\nстроки',
        tasteCategory: 'VI',
        store: { mode: 'new', name: 'Goodwill', countryCode: 'GE' },
      }),
    })
    expect(entry.status).toBe(201)

    return { accessToken, entry: (await entry.json()).entry }
  }

  test('restores a working diary from a backup after the data is gone', async () => {
    const { accessToken, entry } = await seedDiary()
    const storage = createMemoryStorage()
    const backups = new BackupService({ db: prisma, storage, clock: { now: () => new Date() } })

    const { key, rows } = await backups.create()
    expect(rows.users).toBe(1)
    expect(rows.tasting_entries).toBe(1)
    expect(rows.wines).toBe(1)

    // Катастрофа: базы больше нет.
    await wipeDatabase()
    expect(await prisma.user.count()).toBe(0)

    const restored = await backups.restore(key)
    expect(restored.users).toBe(1)

    // Данные вернулись целиком, включая типы, которые легко потерять при ручной сериализации.
    const savedEntry = await prisma.tastingEntry.findUniqueOrThrow({
      where: { id: entry.id },
      include: { wine: true, store: true },
    })
    expect(savedEntry.rating.toString()).toBe('4.5')
    expect(savedEntry.price?.toString()).toBe('60')
    expect(savedEntry.notes).toBe('Заметка с «кавычками» и переносом\nстроки')
    expect(savedEntry.tasteCategory).toBe('VI')
    expect(savedEntry.wine.grapes).toEqual(['Саперави'])
    expect(savedEntry.wine.abv?.toString()).toBe('13.5')
    expect(savedEntry.store?.name).toBe('Goodwill')

    // И главное: восстановленный дневник работает, а не просто лежит в таблицах.
    const week = await app.request('/api/week?date=2026-07-22', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    expect(week.status).toBe(200)
    expect((await week.json()).entries).toHaveLength(1)
  })

  test('keeps recent copies and removes the ones past the retention window', async () => {
    const storage = createMemoryStorage()
    const backups = new BackupService({ db: prisma, storage, clock: { now: () => new Date() } })

    await backups.create()
    // Копия сорокадневной давности: имя несёт дату, по ней и решается судьба.
    storage.objects.set('backups/db-2026-01-01T00-00-00Z.json.gz', new Uint8Array())

    const removed = await backups.prune()

    expect(removed).toBe(1)
    expect(await storage.list('backups/')).toHaveLength(1)
  })
})

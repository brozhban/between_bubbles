import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Jimp, JimpMime } from 'jimp'

import { createApp } from '../../app'
import { createPrisma } from '../../db'
import type { AppEnv } from '../../env'

const databaseUrl = process.env.TEST_DATABASE_URL

const maybeDescribe = databaseUrl ? describe : describe.skip

maybeDescribe('photos API integration', () => {
  // Локальное хранилище во временной папке: тест не зависит от DigitalOcean Spaces.
  const mediaDir = mkdtempSync(join(tmpdir(), 'bb-media-'))

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
    MEDIA_LOCAL_DIR: mediaDir,
    PUBLIC_BACKEND_URL: 'http://localhost:3000',
    SPACES_UPLOAD_MAX_BYTES: 10 * 1024 * 1024,
    SPACES_UPLOAD_URL_TTL_SECONDS: 900,
    SPACES_DOWNLOAD_URL_TTL_SECONDS: 300,
    SPACES_PUBLIC_CACHE_CONTROL: 'public, max-age=31536000, immutable',
  }
  const prisma = createPrisma(databaseUrl!)
  const app = createApp({ env, prisma })

  beforeEach(async () => {
    await prisma.entryPhoto.deleteMany()
    await prisma.tastingEntry.deleteMany()
    await prisma.week.deleteMany()
    await prisma.wine.deleteMany()
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
    return body.accessToken as string
  }

  function authed(accessToken: string, init: RequestInit = {}): RequestInit {
    return {
      ...init,
      headers: { Authorization: `Bearer ${accessToken}`, ...(init.headers ?? {}) },
    }
  }

  async function createEntry(accessToken: string): Promise<string> {
    const response = await app.request(
      '/api/entries',
      authed(accessToken, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wine: { mode: 'new', wine: { name: 'Saperavi', type: 'RED' } },
          tastedOn: '2026-07-22',
          volumeMl: 150,
          rating: 4.5,
        }),
      }),
    )
    expect(response.status).toBe(201)
    return (await response.json()).entry.id
  }

  async function jpegBytes(width = 1200, height = 900): Promise<Uint8Array> {
    return new Jimp({ width, height, color: 0xcc5533ff }).getBuffer(JimpMime.jpeg)
  }

  async function uploadPhoto(
    accessToken: string,
    entryId: string,
    kind: 'BOTTLE' | 'LABEL',
    bytes: Uint8Array,
  ) {
    return app.request(
      `/api/entries/${entryId}/photos?kind=${kind}`,
      authed(accessToken, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: bytes as unknown as BodyInit,
      }),
    )
  }

  test('uploads a photo, then serves the processed bytes through the signed link', async () => {
    const token = await registerUser('photo@example.com')
    const entryId = await createEntry(token)

    const upload = await uploadPhoto(token, entryId, 'BOTTLE', await jpegBytes())
    const { photo } = await upload.json()

    expect(upload.status).toBe(201)
    expect(photo.kind).toBe('BOTTLE')
    expect(photo.width).toBe(1200)
    expect(photo.url).toContain('/media?')

    // Подписанная ссылка отдаёт настоящий JPEG.
    const path = photo.url.replace('http://localhost:3000', '')
    const served = await app.request(path)
    expect(served.status).toBe(200)
    expect(served.headers.get('content-type')).toBe('image/jpeg')
    const servedBytes = new Uint8Array(await served.arrayBuffer())
    expect(servedBytes[0]).toBe(0xff)
    expect(servedBytes[1]).toBe(0xd8)

    // Фото приезжает в детали записи.
    const entry = await app.request(`/api/entries/${entryId}`, authed(token))
    expect((await entry.json()).entry.photos).toHaveLength(1)
  })

  test('rejects a tampered or expired media link', async () => {
    const token = await registerUser('tamper@example.com')
    const entryId = await createEntry(token)
    const upload = await uploadPhoto(token, entryId, 'BOTTLE', await jpegBytes())
    const { photo } = await upload.json()

    const url = new URL(photo.url)
    url.searchParams.set('signature', 'deadbeef')
    const tampered = await app.request(url.pathname + url.search)
    expect(tampered.status).toBe(403)

    url.searchParams.set('signature', new URL(photo.url).searchParams.get('signature')!)
    url.searchParams.set('expires', '1000000000') // 2001 год — просрочено
    const expired = await app.request(url.pathname + url.search)
    expect(expired.status).toBe(403)
  })

  test('rejects a non-image and enforces the two-photo limit', async () => {
    const token = await registerUser('limit@example.com')
    const entryId = await createEntry(token)

    const notImage = await app.request(
      `/api/entries/${entryId}/photos?kind=BOTTLE`,
      authed(token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
      }),
    )
    expect(notImage.status).toBe(422)

    await uploadPhoto(token, entryId, 'BOTTLE', await jpegBytes())
    await uploadPhoto(token, entryId, 'LABEL', await jpegBytes())
    const third = await uploadPhoto(token, entryId, 'BOTTLE', await jpegBytes())
    expect(third.status).toBe(422)
  })

  test('cuts off a body over 10 MB without decoding it', async () => {
    const token = await registerUser('too-big@example.com')
    const entryId = await createEntry(token)

    const response = await uploadPhoto(
      token,
      entryId,
      'BOTTLE',
      new Uint8Array(11 * 1024 * 1024),
    )

    expect(response.status).toBe(413)
    expect(await prisma.entryPhoto.count()).toBe(0)
  })

  test('throttles a flood of photo requests (ТЗ §13)', async () => {
    // Отдельный экземпляр приложения: счётчики лимита живут в его памяти и не должны
    // расходовать окно остальных тестов файла.
    const isolated = createApp({ env, prisma })
    const token = await registerUser('flood@example.com')
    const entryId = await createEntry(token)

    // Окно выбираем удалениями несуществующего фото: они дёшевы и попадают в тот же счётчик,
    // что и загрузки, поэтому картинку не приходится декодировать сорок раз.
    const statuses: number[] = []
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const response = await isolated.request(
        `/api/entries/${entryId}/photos/00000000-0000-7000-8000-000000000000`,
        authed(token, { method: 'DELETE' }),
      )
      statuses.push(response.status)
    }
    expect(statuses.every((status) => status === 404)).toBe(true)

    const throttled = await isolated.request(
      `/api/entries/${entryId}/photos?kind=BOTTLE`,
      authed(token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: (await jpegBytes()) as unknown as BodyInit,
      }),
    )
    expect(throttled.status).toBe(429)
    expect(await prisma.entryPhoto.count()).toBe(0)
  })

  test('never lets one user attach a photo to another user entry', async () => {
    const owner = await registerUser('owner-photo@example.com')
    const stranger = await registerUser('stranger-photo@example.com')
    const entryId = await createEntry(owner)

    const response = await uploadPhoto(stranger, entryId, 'BOTTLE', await jpegBytes())
    expect(response.status).toBe(404)
  })

  test('purging an entry deletes its photo files from storage', async () => {
    const token = await registerUser('purge-photo@example.com')
    const entryId = await createEntry(token)
    const upload = await uploadPhoto(token, entryId, 'BOTTLE', await jpegBytes())
    const { photo } = await upload.json()
    const servedPath = photo.url.replace('http://localhost:3000', '')

    // Файл на месте до удаления.
    expect((await app.request(servedPath)).status).toBe(200)

    await app.request(`/api/entries/${entryId}`, authed(token, { method: 'DELETE' }))
    await app.request(`/api/entries/${entryId}/permanent`, authed(token, { method: 'DELETE' }))

    // Строка ушла каскадом, а файл — руками сервиса: ссылка больше ничего не отдаёт.
    const gone = await app.request(servedPath)
    expect(gone.status).toBe(404)
    expect(await prisma.entryPhoto.count()).toBe(0)
  })
})

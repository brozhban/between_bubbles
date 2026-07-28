import { describe, expect, test } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { BackendRuntime } from './runtime'
import { runCronTask } from './cron'

const runtime = {} as BackendRuntime

/** Удаление файлов идёт по настоящему пути, поэтому уводим его во временную папку. */
const mediaDir = mkdtempSync(join(tmpdir(), 'bb-cron-media-'))

describe('runCronTask', () => {
  test('runs the noop task', async () => {
    await expect(runCronTask('noop', runtime)).resolves.toBeUndefined()
  })

  test('rejects unknown tasks', async () => {
    await expect(runCronTask('missing', runtime)).rejects.toThrow('Unknown cron task')
  })

  test('deletes expired and revoked auth sessions after the retention window', async () => {
    const calls: unknown[] = []
    const cleanupRuntime = {
      env: { SESSION_ABSOLUTE_TTL_DAYS: 90, SESSION_RETENTION_DAYS: 7 },
      prisma: {
        authSession: {
          deleteMany: async (input: unknown) => {
            calls.push(input)
            return { count: 2 }
          },
        },
      },
    } as unknown as BackendRuntime

    const now = new Date('2026-04-08T12:00:00.000Z')
    await runCronTask('auth:sessions:cleanup', cleanupRuntime, now)

    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      where: {
        OR: [
          { expiresAt: { lt: expect.any(Date) } },
          { revokedAt: { lt: expect.any(Date) } },
          { createdAt: { lt: new Date('2026-01-01T12:00:00.000Z') } },
        ],
      },
    })
  })

  test('purges trashed entries only after the 30-day retention window', async () => {
    const calls: unknown[] = []
    const purgeRuntime = {
      prisma: {
        tastingEntry: {
          deleteMany: async (input: unknown) => {
            calls.push(input)
            return { count: 3 }
          },
        },
      },
    } as unknown as BackendRuntime

    await runCronTask('diary:trash:purge', purgeRuntime, new Date('2026-07-22T12:00:00.000Z'))

    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      where: { deletedAt: { not: null, lt: new Date('2026-06-22T12:00:00.000Z') } },
    })
  })

  test('deletes photo files and anonymizes stores before removing an expired account', async () => {
    const order: string[] = []
    const purgeRuntime = {
      // Без SPACES_* модуль фото берёт локальное хранилище, поэтому облако тесту не нужно.
      env: { JWT_SECRET: '12345678901234567890123456789012', MEDIA_LOCAL_DIR: mediaDir },
      prisma: {
        entryPhoto: {
          findMany: async () => {
            order.push('photos')
            return [
              {
                storageKey: 'users/user-1/entries/entry-1/photo-1-full.jpg',
                thumbKey: 'users/user-1/entries/entry-1/photo-1-thumb.jpg',
              },
            ]
          },
        },
        user: {
          findMany: async () => [{ id: 'user-1' }],
          deleteMany: async () => {
            order.push('users')
            return { count: 1 }
          },
        },
        store: {
          updateMany: async () => {
            order.push('stores')
            return { count: 2 }
          },
        },
      },
    } as unknown as BackendRuntime

    await runCronTask('accounts:purge', purgeRuntime, new Date('2026-07-22T12:00:00.000Z'))

    // Файлы уходят первыми: после удаления строк по каскаду искать их будет уже негде (ТЗ §14).
    // Магазины теряют автора до удаления пользователя, иначе связь оборвётся жёстко.
    expect(order).toEqual(['photos', 'stores', 'users'])
  })
})

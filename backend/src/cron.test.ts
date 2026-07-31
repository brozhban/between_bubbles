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

  test('purges trashed entries with their files and empty weeks after 30 days', async () => {
    const deleted: string[] = []
    const removedWeeks: unknown[] = []
    let cutoff: unknown = null

    const tx = {
      tastingEntry: {
        findMany: async (input: { where: { deletedAt: { lt: Date } } }) => {
          cutoff = input.where.deletedAt.lt
          return [
            {
              id: 'entry-1',
              userId: 'user-1',
              weekId: 'week-1',
              photos: [
                {
                  id: 'photo-1',
                  entryId: 'entry-1',
                  kind: 'BOTTLE',
                  storageKey: 'users/user-1/entries/entry-1/photo-1-full.jpg',
                  thumbKey: 'users/user-1/entries/entry-1/photo-1-thumb.jpg',
                  width: 1600,
                  height: 1200,
                  sizeBytes: 1024,
                  mimeType: 'image/jpeg',
                  createdAt: new Date(),
                },
              ],
            },
          ]
        },
        deleteMany: async () => {
          deleted.push('entries')
          return { count: 1 }
        },
        count: async () => 0,
      },
      week: {
        deleteMany: async (input: unknown) => {
          removedWeeks.push(input)
          return { count: 1 }
        },
      },
    }

    const purgeRuntime = {
      // Без SPACES_* модуль фото берёт локальное хранилище, поэтому облако тесту не нужно.
      env: { JWT_SECRET: '12345678901234567890123456789012', MEDIA_LOCAL_DIR: mediaDir },
      prisma: {
        $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
      },
    } as unknown as BackendRuntime

    await runCronTask('diary:trash:purge', purgeRuntime, new Date('2026-07-22T12:00:00.000Z'))

    expect(cutoff).toEqual(new Date('2026-06-22T12:00:00.000Z'))
    expect(deleted).toEqual(['entries'])
    // Пустая неделя уходит вместе с последней записью — как и при ручной очистке корзины.
    expect(removedWeeks).toEqual([{ where: { id: 'week-1', userId: 'user-1' } }])
  })

  test('leaves storage untouched when the trash has nothing expired', async () => {
    const tx = {
      tastingEntry: {
        findMany: async () => [],
        deleteMany: async () => {
          throw new Error('нечего удалять — вызова быть не должно')
        },
        count: async () => 0,
      },
      week: { deleteMany: async () => ({ count: 0 }) },
    }

    const purgeRuntime = {
      env: { JWT_SECRET: '12345678901234567890123456789012', MEDIA_LOCAL_DIR: mediaDir },
      prisma: {
        $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
      },
    } as unknown as BackendRuntime

    await expect(
      runCronTask('diary:trash:purge', purgeRuntime, new Date('2026-07-22T12:00:00.000Z')),
    ).resolves.toBeUndefined()
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

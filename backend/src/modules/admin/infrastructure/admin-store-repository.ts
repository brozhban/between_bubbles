import type { AdminStoreDto } from '@between-bubbles/contracts'

import type { DbClient } from '../../../db'
import { normalizeStoreName } from '../../diary'
import type { AdminStoreRepository } from '../application/ports'

/**
 * Prisma-адаптер админки. Магазины — общая таблица, поэтому фильтра по владельцу здесь нет
 * и быть не должно: есть только статус, страна и поиск по нормализованному имени.
 */
export function createPrismaAdminStoreRepository(db: DbClient): AdminStoreRepository {
  const withCounts = { _count: { select: { entries: true } } }

  return {
    async list({ status, search, country, limit }) {
      const stores = await db.store.findMany({
        where: {
          ...(status ? { status } : {}),
          ...(country ? { countryCode: country } : {}),
          ...(search ? { normalizedName: { contains: normalizeStoreName(search) } } : {}),
        },
        include: withCounts,
        // Новые сверху: постмодерация — это просмотр того, что успели насоздавать (ТЗ §5.2).
        orderBy: [{ createdAt: 'desc' }],
        take: limit,
      })

      return stores.map(toAdminStoreDto)
    },

    async findById(storeId) {
      const store = await db.store.findUnique({ where: { id: storeId }, include: withCounts })
      return store ? toAdminStoreDto(store) : null
    },

    async merge({ sourceId, targetId }) {
      return db.$transaction(async (tx) => {
        const source = await tx.store.findUnique({ where: { id: sourceId } })
        if (!source || source.status === 'MERGED') return null

        // Записи переезжают на мастер: в старых карточках должен остаться живой магазин,
        // а не строка, которая больше нигде не предлагается.
        await tx.tastingEntry.updateMany({
          where: { storeId: sourceId },
          data: { storeId: targetId },
        })

        // Личные списки «мои магазины» тоже переезжают. Пара (user, store) уникальна, поэтому
        // у кого дубль и мастер уже оба в списке — просто удаляем строку дубля.
        const recents = await tx.userStoreRecent.findMany({ where: { storeId: sourceId } })
        for (const recent of recents) {
          const existing = await tx.userStoreRecent.findUnique({
            where: { userId_storeId: { userId: recent.userId, storeId: targetId } },
          })

          if (existing) {
            await tx.userStoreRecent.update({
              where: { userId_storeId: { userId: recent.userId, storeId: targetId } },
              data: {
                useCount: existing.useCount + recent.useCount,
                lastUsed: existing.lastUsed > recent.lastUsed ? existing.lastUsed : recent.lastUsed,
              },
            })
            await tx.userStoreRecent.delete({
              where: { userId_storeId: { userId: recent.userId, storeId: sourceId } },
            })
          } else {
            await tx.userStoreRecent.update({
              where: { userId_storeId: { userId: recent.userId, storeId: sourceId } },
              data: { storeId: targetId },
            })
          }
        }

        await tx.store.update({
          where: { id: targetId },
          data: { usageCount: { increment: source.usageCount } },
        })
        await tx.store.update({
          where: { id: sourceId },
          data: { status: 'MERGED', mergedIntoId: targetId, usageCount: 0 },
        })

        const target = await tx.store.findUnique({ where: { id: targetId }, include: withCounts })
        return target ? toAdminStoreDto(target) : null
      })
    },

    async setStatus({ storeId, status }) {
      const updated = await db.store.updateManyAndReturn({
        // Слитый дубль не возвращается в оборот сменой статуса: его записи уже на мастере.
        where: { id: storeId, status: { not: 'MERGED' } },
        data: { status },
      })
      if (updated.length === 0) return null

      const store = await db.store.findUnique({ where: { id: storeId }, include: withCounts })
      return store ? toAdminStoreDto(store) : null
    },
  }
}

function toAdminStoreDto(store: {
  id: string
  name: string
  countryCode: string
  city: string | null
  kind: AdminStoreDto['kind']
  status: AdminStoreDto['status']
  mergedIntoId: string | null
  usageCount: number
  createdAt: Date
  _count: { entries: number }
}): AdminStoreDto {
  return {
    id: store.id,
    name: store.name,
    countryCode: store.countryCode,
    city: store.city,
    kind: store.kind,
    status: store.status,
    mergedIntoId: store.mergedIntoId,
    usageCount: store.usageCount,
    entryCount: store._count.entries,
    createdAt: store.createdAt.toISOString(),
  }
}

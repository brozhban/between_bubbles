import type { DbClient } from '../../../db'

import type { StoreRepository } from '../application/ports'
import { normalizeStoreName } from '../domain/store-matching'

/**
 * Общий справочник магазинов. В отличие от дневника, эти строки не принадлежат пользователю:
 * фильтрации по `userId` здесь нет и быть не должно — есть только статус и постмодерация.
 */
export function createPrismaStoreRepository(db: DbClient): StoreRepository {
  return {
    async search({ query, countryCode, limit }) {
      const stores = await db.store.findMany({
        where: {
          status: 'ACTIVE',
          ...(countryCode ? { countryCode } : {}),
          ...(query ? { normalizedName: { contains: normalizeStoreName(query) } } : {}),
        },
        orderBy: [{ usageCount: 'desc' }, { name: 'asc' }],
        take: limit,
      })

      return stores.map(toStoreRecord)
    },

    async listRecentForUser({ userId, limit }) {
      const recents = await db.userStoreRecent.findMany({
        where: { userId, store: { status: 'ACTIVE' } },
        include: { store: true },
        orderBy: [{ lastUsed: 'desc' }],
        take: limit,
      })

      return recents.map((recent) => toStoreRecord(recent.store))
    },

    async listForDuplicateCheck({ countryCode, limit }) {
      // Берём самые используемые магазины страны: именно среди них живут дубли,
      // которые стоит поймать, а полный справочник тянуть незачем.
      const stores = await db.store.findMany({
        where: { status: 'ACTIVE', ...(countryCode ? { countryCode } : {}) },
        orderBy: [{ usageCount: 'desc' }, { name: 'asc' }],
        take: limit,
      })

      return stores.map(toStoreRecord)
    },

    async findById({ storeId }) {
      const store = await db.store.findFirst({ where: { id: storeId, status: 'ACTIVE' } })
      return store ? toStoreRecord(store) : null
    },

    countCreatedSince({ userId, since }) {
      return db.store.count({ where: { createdByUserId: userId, createdAt: { gte: since } } })
    },

    async create({ userId, name, normalizedName, countryCode, city, kind }) {
      // Через `upsert` здесь пройти нельзя: город необязателен, а составной уникальный ключ
      // Prisma не принимает null. К тому же в PostgreSQL NULL-значения считаются различными,
      // поэтому уникальный индекс всё равно не отсеёк бы магазины без города — сначала ищем сами.
      const where = { normalizedName, countryCode, city: city ?? null }
      const existing = await db.store.findFirst({ where })
      if (existing) return toStoreRecord(existing)

      try {
        const store = await db.store.create({
          data: { ...where, name, kind, createdByUserId: userId },
        })
        return toStoreRecord(store)
      } catch (error) {
        // Гонка: тот же магазин с городом создали между проверкой и вставкой.
        const raced = await db.store.findFirst({ where })
        if (raced) return toStoreRecord(raced)
        throw error
      }
    },
  }
}

function toStoreRecord(store: {
  id: string
  name: string
  countryCode: string
  city: string | null
  kind: 'SUPERMARKET' | 'WINE_SHOP' | 'RESTAURANT' | 'BAR' | 'ONLINE' | 'OTHER'
  usageCount: number
}) {
  return {
    id: store.id,
    name: store.name,
    countryCode: store.countryCode.trim(),
    city: store.city,
    kind: store.kind,
    usageCount: store.usageCount,
  }
}

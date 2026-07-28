import type { DbClient } from '../../../db'

import type { ProfileRepository } from '../application/ports'

/**
 * Обновление настроек всегда идёт по `userId` — чужой профиль просто не находится,
 * как и любая другая пользовательская сущность (ТЗ §2).
 */
export function createPrismaProfileRepository(db: DbClient): ProfileRepository {
  return {
    async updateSettings({ userId, settings }) {
      const updated = await db.user.updateMany({
        where: { id: userId, deletedAt: null },
        data: settings,
      })
      if (updated.count === 0) return null

      return db.user.findUnique({ where: { id: userId } })
    },
  }
}

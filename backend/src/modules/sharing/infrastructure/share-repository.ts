import type { DbClient } from '../../../db'
import type { AuthorReader, ShareRepository } from '../application/ports'

/**
 * Prisma-адаптер ссылок. Каждая операция владельца идёт по паре `userId + entryId`:
 * чужая запись просто не находится и наверх уходит null → 404 (ТЗ §2).
 */
export function createPrismaShareRepository(db: DbClient): ShareRepository {
  const active = { revokedAt: null }

  return {
    async findForEntry({ userId, entryId }) {
      const link = await db.shareLink.findFirst({ where: { userId, entryId, ...active } })
      return link ?? null
    },

    async findActiveBySlug(slug) {
      const link = await db.shareLink.findFirst({ where: { slug, ...active } })
      return link ?? null
    },

    async create({ userId, entryId, slug, showName }) {
      // Публиковать можно только свою и только живую запись: удалённой в корзину делиться
      // нечем, а чужой — тем более.
      const entry = await db.tastingEntry.findFirst({
        where: { id: entryId, userId, deletedAt: null },
        select: { id: true },
      })
      if (!entry) return null

      return db.shareLink.create({ data: { userId, entryId, slug, showName } })
    },

    async updateShowName({ userId, entryId, showName }) {
      const updated = await db.shareLink.updateManyAndReturn({
        where: { userId, entryId, ...active },
        data: { showName },
      })
      return updated[0] ?? null
    },

    async revoke({ userId, entryId, now }) {
      const revoked = await db.shareLink.updateMany({
        where: { userId, entryId, ...active },
        data: { revokedAt: now },
      })
      return revoked.count > 0
    },
  }
}

/** Имя и язык автора для публичной страницы. Удалённый аккаунт автором быть перестаёт. */
export function createPrismaAuthorReader(db: DbClient): AuthorReader {
  return {
    async findAuthor(userId) {
      const user = await db.user.findFirst({
        where: { id: userId, deletedAt: null },
        select: { displayName: true, locale: true },
      })
      if (!user) return null

      return {
        displayName: user.displayName,
        locale: user.locale === 'en' ? 'en' : 'ru',
      }
    },
  }
}

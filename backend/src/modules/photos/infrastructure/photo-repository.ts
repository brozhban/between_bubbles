import type { DbClient } from '../../../db'
import type { PhotoRecord, PhotoRepository } from '../application/ports'
import { MAX_PHOTOS_PER_ENTRY } from '../domain/image'

/**
 * Prisma-адаптер фото. Все операции идут по `userId`: чужой entryId или photoId просто
 * не находится, наверх уходит null → 404 (ТЗ §2).
 */
export function createPrismaPhotoRepository(db: DbClient): PhotoRepository {
  return {
    countForEntry({ userId, entryId }) {
      return db.entryPhoto.count({ where: { entryId, userId } })
    },

    async entryBelongsToUser({ userId, entryId }) {
      const entry = await db.tastingEntry.findFirst({
        where: { id: entryId, userId, deletedAt: null },
        select: { id: true },
      })
      return entry !== null
    },

    async create(input) {
      /*
       * Лимит проверяется внутри транзакции, под блокировкой строки записи.
       *
       * Снаружи он уже посчитан, но между тем счётом и вставкой помещается второй запрос:
       * два параллельных сохранения видели по одному фото каждое и добавляли третье.
       * `FOR UPDATE` на строке записи выстраивает такие запросы в очередь — блокируются
       * только загрузки в одну и ту же запись, остальные друг другу не мешают.
       */
      const photo = await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM tasting_entries WHERE id = ${input.entryId}::uuid FOR UPDATE`

        const existing = await tx.entryPhoto.count({
          where: { entryId: input.entryId, userId: input.userId },
        })
        if (existing >= MAX_PHOTOS_PER_ENTRY) return null

        return tx.entryPhoto.create({
          data: {
            userId: input.userId,
            entryId: input.entryId,
            kind: input.kind,
            storageKey: input.storageKey,
            thumbKey: input.thumbKey,
            width: input.width,
            height: input.height,
            sizeBytes: input.sizeBytes,
            mimeType: input.mimeType,
          },
        })
      })

      return photo ? toRecord(photo) : null
    },

    async findForEntry({ userId, entryId }) {
      const photos = await db.entryPhoto.findMany({
        where: { entryId, userId },
        orderBy: { createdAt: 'asc' },
      })
      return photos.map(toRecord)
    },

    async findById({ userId, photoId }) {
      const photo = await db.entryPhoto.findFirst({ where: { id: photoId, userId } })
      return photo ? toRecord(photo) : null
    },

    async delete({ userId, photoId }) {
      const photo = await db.entryPhoto.findFirst({ where: { id: photoId, userId } })
      if (!photo) return null

      await db.entryPhoto.delete({ where: { id: photoId } })
      return toRecord(photo)
    },
  }
}

function toRecord(photo: {
  id: string
  kind: PhotoRecord['kind']
  storageKey: string
  thumbKey: string
  width: number
  height: number
}): PhotoRecord {
  return {
    id: photo.id,
    kind: photo.kind,
    storageKey: photo.storageKey,
    thumbKey: photo.thumbKey,
    width: photo.width,
    height: photo.height,
  }
}

import type { MiddlewareHandler } from 'hono'

import type { DbClient } from '../../db'
import type { AuthHttpEnv } from '../auth'
import { DiaryService, type EntryPhotos, type PhotoFileCleaner } from './application/diary-service'
import type { Clock } from './application/ports'
import { StoreService } from './application/store-service'
import {
  createPrismaDiaryRepository,
  purgeExpiredTrash,
  seedSystemAromaTags,
} from './infrastructure/diary-repository'
import { createPrismaStoreRepository } from './infrastructure/store-repository'
import { createDiaryRoutes } from './transport/routes'

type CreateDiaryModuleOptions = {
  clock?: Clock
  db: DbClient
  requireAuth: MiddlewareHandler<AuthHttpEnv>
  photos?: EntryPhotos
  photoFiles?: PhotoFileCleaner
}

const systemClock: Clock = {
  now: () => new Date(),
}

export function createDiaryModule({
  clock = systemClock,
  db,
  requireAuth,
  photos,
  photoFiles,
}: CreateDiaryModuleOptions) {
  const stores = new StoreService({
    clock,
    repository: createPrismaStoreRepository(db),
  })
  const diary = new DiaryService({
    clock,
    repository: createPrismaDiaryRepository(db),
    stores,
    photos,
    photoFiles,
  })

  return {
    routes: createDiaryRoutes({ diary, requireAuth, stores }),
    /**
     * Чтение одной записи для модуля публикации (ТЗ §12). Отдаётся обычное DTO дневника,
     * а решение о том, что из него уедет на публичную страницу, принимает сам `sharing`.
     */
    entryReader: {
      findEntry: (input: { userId: string; entryId: string }) =>
        diary.findEntryForSharing(input),
    },
  }
}

export { purgeExpiredTrash, seedSystemAromaTags }
/**
 * Нормализация названия магазина. Общий справочник живёт в дневнике, а админка ищет по нему
 * теми же правилами — иначе постмодерация не находила бы то, что видит пользователь (ТЗ §5.2).
 */
export { normalizeStoreName } from './domain/store-matching'
export type { DiaryActor, EntryPhotos } from './application/diary-service'

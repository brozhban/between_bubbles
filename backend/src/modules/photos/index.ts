import { resolve } from 'node:path'

import { S3Client } from '@aws-sdk/client-s3'
import type { EntryPhotoDto } from '@between-bubbles/contracts'
import { Hono, type MiddlewareHandler } from 'hono'

import type { DbClient } from '../../db'
import type { AppEnv } from '../../env'
import { createRateLimit } from '../../http/security'
import { StorageService, storageConfigFromEnv } from '../../storage/service'
import type { AuthHttpEnv } from '../auth'
import { PhotoService } from './application/photo-service'
import type { ObjectStore } from './application/ports'
import { UPLOAD_RATE_LIMIT_MAX, UPLOAD_RATE_LIMIT_WINDOW_SECONDS } from './domain/image'
import { createJimpImageProcessor } from './infrastructure/image-processor'
import {
  createLocalObjectStore,
  createSpacesObjectStore,
  createSpacesPutObject,
} from './infrastructure/object-store'
import { createPrismaPhotoRepository } from './infrastructure/photo-repository'
import { createPhotoRoutes } from './transport/routes'

/**
 * Локальная отдача фото по подписанной ссылке. Существует только без Spaces: в проде картинки
 * идут прямо из бакета. Путь знает и приложение — у этого маршрута своя политика встраивания.
 */
export const MEDIA_ROUTE_PATH = '/media'

/**
 * Порт чтения фото для модуля дневника: отдаёт готовые DTO с подписанными ссылками по списку
 * записей. Диари не знает про хранилище — он получает уже подписанные URL.
 */
export type EntryPhotoReader = {
  photosForEntries(input: {
    userId: string
    entryIds: readonly string[]
  }): Promise<Map<string, EntryPhotoDto[]>>
}

type CreatePhotoModuleOptions = {
  db: DbClient
  env: AppEnv
  requireAuth: MiddlewareHandler<AuthHttpEnv>
  /** Базовый URL бэкенда для локальных медиа-ссылок; в проде используется Spaces. */
  publicBackendUrl: string
}

/**
 * Удаляет все файлы фото пользователей из хранилища. Вызывается фоновой задачей окончательной
 * очистки аккаунтов через 30 дней (ТЗ §14): строки уйдут каскадом, а файлы — только так.
 */
export async function deleteUserPhotoFiles(input: {
  db: DbClient
  env: AppEnv
  userIds: readonly string[]
}): Promise<number> {
  if (input.userIds.length === 0) return 0

  const { store } = createObjectStore({ env: input.env, publicBackendUrl: '' })
  const photos = await input.db.entryPhoto.findMany({
    where: { userId: { in: [...input.userIds] } },
    select: { storageKey: true, thumbKey: true },
  })

  for (const photo of photos) {
    await store.delete(photo.storageKey)
    await store.delete(photo.thumbKey)
  }

  return photos.length
}

export function createPhotoModule({
  db,
  env,
  requireAuth,
  publicBackendUrl,
}: CreatePhotoModuleOptions) {
  const repository = createPrismaPhotoRepository(db)
  const processor = createJimpImageProcessor()
  const { store, mediaRoutes } = createObjectStore({ env, publicBackendUrl })

  const service = new PhotoService({ repository, processor, store })

  const reader: EntryPhotoReader = {
    async photosForEntries({ userId, entryIds }) {
      const byEntry = new Map<string, EntryPhotoDto[]>()
      // Последовательно, а не Promise.all: под pg параллельные запросы на одном соединении
      // предупреждают, а список записей недели невелик.
      for (const entryId of entryIds) {
        byEntry.set(entryId, await service.listForEntry(userId, entryId))
      }
      return byEntry
    },
  }

  return {
    routes: createPhotoRoutes({
      photos: service,
      requireAuth,
      rateLimit: createRateLimit({
        max: UPLOAD_RATE_LIMIT_MAX,
        windowSeconds: UPLOAD_RATE_LIMIT_WINDOW_SECONDS,
        message: 'Too many photo uploads',
        trustProxy: env.TRUST_PROXY,
        trustedProxyClientIpHeader: env.TRUSTED_PROXY_CLIENT_IP_HEADER,
        trustedProxyClientIpPosition: env.TRUSTED_PROXY_CLIENT_IP_POSITION,
      }),
    }),
    mediaRoutes,
    reader,
    photoFiles: service,
  }
}

/**
 * Выбор хранилища: Spaces, если заданы SPACES_*; иначе локальный диск для разработки.
 * Локальный вариант отдаёт файлы через собственный маршрут `/media` с HMAC-подписью.
 */
function createObjectStore({
  env,
  publicBackendUrl,
}: {
  env: AppEnv
  publicBackendUrl: string
}): { store: ObjectStore; mediaRoutes: Hono | null } {
  const spacesConfig = storageConfigFromEnv(env)

  if (spacesConfig) {
    const storage = new StorageService(spacesConfig)
    const s3 = new S3Client({
      endpoint: spacesConfig.endpoint,
      region: 'us-east-1',
      forcePathStyle: false,
      credentials: {
        accessKeyId: spacesConfig.accessKeyId,
        secretAccessKey: spacesConfig.secretAccessKey,
      },
    })
    const putObject = createSpacesPutObject({ s3, bucket: spacesConfig.bucket })
    return {
      store: createSpacesObjectStore(storage, spacesConfig.bucket, putObject),
      mediaRoutes: null,
    }
  }

  const directory = resolve(env.MEDIA_LOCAL_DIR ?? '.scratch/media')
  const local = createLocalObjectStore({
    directory,
    baseUrl: publicBackendUrl,
    signingSecret: env.JWT_SECRET,
  })

  const mediaRoutes = new Hono()
  // Публичный, но подписанный маршрут: доступ даёт короткоживущая HMAC-подпись, а не сессия,
  // так же как подписанный URL Spaces.
  mediaRoutes.get(MEDIA_ROUTE_PATH, async (c) => {
    const key = c.req.query('key')
    const expires = c.req.query('expires')
    const signature = c.req.query('signature')
    if (!key || !expires || !signature || !local.verifySignedKey(key, expires, signature)) {
      return c.json({ error: { code: 'FORBIDDEN', message: 'Invalid or expired media link' } }, 403)
    }

    try {
      const bytes = await local.read(key)
      return c.body(bytes as unknown as ArrayBuffer, 200, {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'private, max-age=300',
      })
    } catch {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Media not found' } }, 404)
    }
  })

  return { store: local, mediaRoutes }
}

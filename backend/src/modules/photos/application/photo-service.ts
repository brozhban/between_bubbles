import { randomUUID } from 'node:crypto'

import type { EntryPhotoDto, PhotoKind } from '@between-bubbles/contracts'

import { PhotoFailure } from '../domain/errors'
import { MAX_PHOTOS_PER_ENTRY, PHOTO_URL_TTL_SECONDS, photoObjectKey } from '../domain/image'
import type { ImageProcessor, ObjectStore, PhotoRecord, PhotoRepository } from './ports'

type PhotoServiceDependencies = {
  repository: PhotoRepository
  processor: ImageProcessor
  store: ObjectStore
}

/**
 * Фото записи (ТЗ §11): до 2 штук, приватное хранение, отдача по подписанной ссылке с TTL.
 * Сервис — единственный владелец пары «файл + строка в БД»: если не удаётся записать одно,
 * второе тоже не остаётся висеть.
 */
export class PhotoService {
  constructor(private readonly deps: PhotoServiceDependencies) {}

  async addPhoto(input: {
    userId: string
    entryId: string
    kind: PhotoKind
    bytes: Uint8Array
  }): Promise<EntryPhotoDto> {
    const ownsEntry = await this.deps.repository.entryBelongsToUser({
      userId: input.userId,
      entryId: input.entryId,
    })
    if (!ownsEntry) throw new PhotoFailure('not_found', 'Tasting entry not found')

    const count = await this.deps.repository.countForEntry({
      userId: input.userId,
      entryId: input.entryId,
    })
    if (count >= MAX_PHOTOS_PER_ENTRY) {
      throw new PhotoFailure('limit_reached', 'An entry can have at most two photos')
    }

    // Обработка до записи в БД: битый файл не должен оставлять строку без объекта.
    const processed = await this.deps.processor.process(input.bytes)

    const photoId = randomUUID()
    const storageKey = photoObjectKey({ ...input, photoId, variant: 'full' })
    const thumbKey = photoObjectKey({ ...input, photoId, variant: 'thumb' })

    await this.deps.store.put({
      key: storageKey,
      bytes: processed.full.bytes,
      contentType: processed.mimeType,
    })
    await this.deps.store.put({
      key: thumbKey,
      bytes: processed.thumb.bytes,
      contentType: processed.mimeType,
    })

    // Если строка не записалась, объекты в хранилище остаются без единой ссылки из базы:
    // найти их потом нечем — ключи собраны из идентификатора, которого нигде нет.
    let record
    try {
      record = await this.deps.repository.create({
        userId: input.userId,
        entryId: input.entryId,
        kind: input.kind,
        storageKey,
        thumbKey,
        width: processed.full.width,
        height: processed.full.height,
        sizeBytes: processed.sizeBytes,
        mimeType: processed.mimeType,
      })
    } catch (error) {
      await this.removeFiles({ storageKey, thumbKey }).catch(() => undefined)
      throw error
    }

    return this.toDto(record)
  }

  async listForEntry(userId: string, entryId: string): Promise<EntryPhotoDto[]> {
    const photos = await this.deps.repository.findForEntry({ userId, entryId })
    return Promise.all(photos.map((photo) => this.toDto(photo)))
  }

  async deletePhoto(userId: string, photoId: string): Promise<void> {
    const removed = await this.deps.repository.delete({ userId, photoId })
    if (!removed) throw new PhotoFailure('not_found', 'Photo not found')

    // Файлы удаляем после строки: осиротевший объект в хранилище дешевле осиротевшей ссылки.
    await this.removeFiles(removed)
  }

  /** Окончательная чистка файлов при удалении записи или аккаунта (ТЗ §7.6, §14). */
  async removeStoredFiles(photos: ReadonlyArray<{ storageKey: string; thumbKey: string }>) {
    await Promise.all(photos.map((photo) => this.removeFiles(photo)))
  }

  private async removeFiles(photo: { storageKey: string; thumbKey: string }) {
    await Promise.all([
      this.deps.store.delete(photo.storageKey),
      this.deps.store.delete(photo.thumbKey),
    ])
  }

  private async toDto(record: PhotoRecord): Promise<EntryPhotoDto> {
    const [full, thumb] = await Promise.all([
      this.deps.store.signedUrl({ key: record.storageKey, ttlSeconds: PHOTO_URL_TTL_SECONDS }),
      this.deps.store.signedUrl({ key: record.thumbKey, ttlSeconds: PHOTO_URL_TTL_SECONDS }),
    ])

    return {
      id: record.id,
      kind: record.kind,
      width: record.width,
      height: record.height,
      url: full.url,
      thumbUrl: thumb.url,
      // TTL у обеих версий одинаковый — берём любой; клиент по нему перезапросит ссылки.
      expiresAt: full.expiresAt,
    }
  }
}

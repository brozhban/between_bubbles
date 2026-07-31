import type { PhotoKind } from '@between-bubbles/contracts'

/** Две готовые к хранению версии одной картинки: полноразмерная и миниатюра. */
export type ProcessedImage = {
  full: { bytes: Uint8Array; width: number; height: number }
  thumb: { bytes: Uint8Array }
  mimeType: string
  sizeBytes: number
}

/**
 * Обработчик изображений. Обязан: применить ориентацию EXIF, полностью вырезать метаданные
 * (включая GPS), сжать до 1600 px по длинной стороне и сделать миниатюру 400 px (ТЗ §11).
 */
export type ImageProcessor = {
  process(bytes: Uint8Array): Promise<ProcessedImage>
}

/**
 * Хранилище объектов. Приватное: наружу отдаётся только подписанная ссылка с TTL.
 * Реализуется поверх DigitalOcean Spaces в продакшене и поверх диска в разработке.
 */
export type ObjectStore = {
  put(input: { key: string; bytes: Uint8Array; contentType: string }): Promise<void>
  delete(key: string): Promise<void>
  signedUrl(input: { key: string; ttlSeconds: number }): Promise<{ url: string; expiresAt: string }>
}

export type PhotoRecord = {
  id: string
  kind: PhotoKind
  storageKey: string
  thumbKey: string
  width: number
  height: number
}

export type PhotoRepository = {
  countForEntry(input: { userId: string; entryId: string }): Promise<number>
  /** Владелец проверяется здесь: чужой entryId не находится и запись не создаётся (ТЗ §2). */
  entryBelongsToUser(input: { userId: string; entryId: string }): Promise<boolean>
  create(input: {
    userId: string
    entryId: string
    kind: PhotoKind
    storageKey: string
    thumbKey: string
    width: number
    height: number
    sizeBytes: number
    mimeType: string
    /** `null` — лимит фото на запись уже выбран: проверка идёт под блокировкой строки. */
  }): Promise<PhotoRecord | null>
  findForEntry(input: { userId: string; entryId: string }): Promise<PhotoRecord[]>
  findById(input: { userId: string; photoId: string }): Promise<PhotoRecord | null>
  delete(input: { userId: string; photoId: string }): Promise<PhotoRecord | null>
}

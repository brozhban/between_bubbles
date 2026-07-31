import { Jimp, JimpMime } from 'jimp'

import { PhotoFailure } from '../domain/errors'
import {
  detectImageFormat,
  FULL_MAX_DIMENSION,
  isWithinPixelBudget,
  isWithinUploadLimit,
  readImageSize,
  THUMB_MAX_DIMENSION,
} from '../domain/image'
import type { ImageProcessor, ProcessedImage } from '../application/ports'

/**
 * Обработка фото на jimp (ТЗ §11).
 *
 * jimp вместо sharp сознательно: sharp не загружает нативный биндинг под Bun, а jimp — чистый
 * JS и работает везде, где работает бэкенд. Ограничение jimp — нет WebP; сюда WebP и не
 * доходит, потому что клиент нормализует любую картинку в JPEG до отправки.
 *
 * Метаданные вырезаются самим фактом декодирования в пиксели и обратного кодирования в JPEG —
 * EXIF, включая GPS, в результат физически не попадает. Ориентация применяется к пикселям.
 */
export function createJimpImageProcessor(): ImageProcessor {
  return {
    async process(bytes): Promise<ProcessedImage> {
      if (!isWithinUploadLimit(bytes.byteLength)) {
        throw new PhotoFailure('too_large', 'Image is empty or exceeds the size limit')
      }
      if (detectImageFormat(bytes) === null) {
        throw new PhotoFailure('invalid_image', 'Only JPEG and PNG images are accepted')
      }

      // Размеры читаются до декодирования: `Jimp.read` разворачивает полный растр в память,
      // и на этом шаге ограничивать уже поздно — процесс падает вместе со всем API.
      const size = readImageSize(bytes)
      if (size === null) {
        throw new PhotoFailure('invalid_image', 'Image dimensions could not be read')
      }
      if (!isWithinPixelBudget(size)) {
        throw new PhotoFailure('too_large', 'Image has too many pixels to process')
      }

      let image
      try {
        image = await Jimp.read(Buffer.from(bytes))
      } catch {
        // Сигнатура совпала, но содержимое битое — не даём упасть 500-й.
        throw new PhotoFailure('invalid_image', 'Image could not be decoded')
      }

      // jimp применяет ориентацию EXIF при чтении и не переносит метаданные в результат,
      // поэтому отдельного шага «повернуть и вырезать EXIF» не требуется.
      const full = image.clone()
      scaleWithin(full, FULL_MAX_DIMENSION)
      const fullBytes = await full.getBuffer(JimpMime.jpeg, { quality: 82 })

      const thumb = image.clone()
      scaleWithin(thumb, THUMB_MAX_DIMENSION)
      const thumbBytes = await thumb.getBuffer(JimpMime.jpeg, { quality: 72 })

      return {
        full: { bytes: fullBytes, width: full.width, height: full.height },
        thumb: { bytes: thumbBytes },
        mimeType: 'image/jpeg',
        sizeBytes: fullBytes.byteLength,
      }
    },
  }
}

/** Уменьшает картинку до квадрата max×max по длинной стороне, но никогда не растягивает. */
function scaleWithin(image: ReturnType<typeof Jimp.prototype.clone>, max: number) {
  if (image.width <= max && image.height <= max) return
  image.scaleToFit({ w: max, h: max })
}

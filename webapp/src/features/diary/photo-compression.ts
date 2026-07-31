/**
 * Клиентская подготовка фото перед отправкой (ТЗ §11).
 *
 * Любая выбранная картинка приводится к JPEG ≤ 1600 px по длинной стороне ещё до загрузки.
 * Браузер декодирует JPEG/PNG/WebP нативно, а Safari — ещё и HEIC с iPhone, поэтому холст
 * закрывает все форматы из ТЗ без сторонних библиотек. Рисование на canvas само по себе
 * отбрасывает EXIF, а сервер всё равно вырезает его повторно — клиенту тут не доверяют.
 */

import type { MessageKey } from '@/platform/i18n'

const MAX_DIMENSION = 1600
const JPEG_QUALITY = 0.82

/**
 * Несёт ключ подписи, а не готовый текст: сообщение показывается пользователю, значит
 * обязано быть на языке интерфейса. Раньше одна строка была русской, две — английскими.
 */
export class PhotoCompressionError extends Error {
  readonly messageKey: MessageKey

  constructor(messageKey: MessageKey) {
    super(messageKey)
    this.messageKey = messageKey
  }
}

export async function compressToJpeg(file: File): Promise<Uint8Array> {
  const bitmap = await decode(file)

  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new PhotoCompressionError('photos.compressFailed')
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close?.()

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
  )
  if (!blob) throw new PhotoCompressionError('photos.compressFailed')

  return new Uint8Array(await blob.arrayBuffer())
}

/**
 * `createImageBitmap` с `imageOrientation: 'from-image'` применяет ориентацию EXIF к пикселям —
 * фото не окажется повёрнутым. Если браузер не может декодировать формат (HEIC вне Safari),
 * даём понятную ошибку, а не роняем форму.
 */
async function decode(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new PhotoCompressionError('photos.decodeFailed')
  }
}

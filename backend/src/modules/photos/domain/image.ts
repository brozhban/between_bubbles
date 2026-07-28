/**
 * Правила работы с фото (ТЗ §11).
 *
 * Формат определяется по сигнатуре файла, а не по расширению или заголовку Content-Type:
 * клиент не заслуживает доверия, а расширение подделывается тривиально.
 */

/** До 2 фото на запись: бутылка и этикетка. */
export const MAX_PHOTOS_PER_ENTRY = 2

/** Максимум 10 МБ до обработки. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

/** Длинная сторона полноразмерной версии и миниатюры. */
export const FULL_MAX_DIMENSION = 1600
export const THUMB_MAX_DIMENSION = 400

/** TTL подписанных ссылок на фото — 5 минут (ТЗ §11). */
export const PHOTO_URL_TTL_SECONDS = 5 * 60

/**
 * Лимит частоты загрузок (ТЗ §13). Считается по адресу клиента, а не по пользователю:
 * ограничивать нужно трафик и процессорное время на декодирование, а тратит их соединение.
 * Живой человек и десяти фото за минуту не добавит; сорок хватает даже офису за одним NAT.
 */
export const UPLOAD_RATE_LIMIT_MAX = 40
export const UPLOAD_RATE_LIMIT_WINDOW_SECONDS = 60

export type DetectedImageFormat = 'jpeg' | 'png'

/**
 * Форматы, которые сервер принимает после клиентской нормализации.
 *
 * Клиент приводит любую выбранную картинку (в т.ч. WebP и HEIC с iPhone) к JPEG через
 * canvas ещё до отправки, поэтому серверу достаточно JPEG и PNG. Оба формата умеет jimp;
 * WebP он не декодирует, но сюда WebP уже и не доходит.
 */
export function detectImageFormat(bytes: Uint8Array): DetectedImageFormat | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpeg'
  }

  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (bytes.length >= png.length && png.every((byte, index) => bytes[index] === byte)) {
    return 'png'
  }

  return null
}

export function isWithinUploadLimit(byteLength: number): boolean {
  return byteLength > 0 && byteLength <= MAX_UPLOAD_BYTES
}

/** Ключ объекта фото: `users/{userId}/entries/{entryId}/{photoId}-{variant}.jpg`. */
export function photoObjectKey(input: {
  userId: string
  entryId: string
  photoId: string
  variant: 'full' | 'thumb'
}): string {
  return `users/${input.userId}/entries/${input.entryId}/${input.photoId}-${input.variant}.jpg`
}

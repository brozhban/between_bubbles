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

/**
 * Бюджет пикселей.
 *
 * Размер файла ничего не говорит о стоимости декодирования: PNG на 144 КБ разворачивается
 * в 6000×6000 и съедает полгигабайта, а API живёт в одном контейнере на 1 ГБ — одного
 * запроса хватает, чтобы уронить процесс для всех. Лимит частоты здесь не спасает.
 *
 * Считано по замеру: 36 млн пикселей дали 535 МБ, то есть около 15 МБ на миллион (растр
 * RGBA плюс два клона до масштабирования). 16 млн — это ~240 МБ пика: контейнер переживает.
 * Сверху граница пропускает обычное фото с телефона на 12 Мп (4032×3024), снизу оставляет
 * шестикратный запас к 1600 px, до которых клиент ужимает картинку перед отправкой.
 */
export const MAX_IMAGE_PIXELS = 16_000_000

export interface ImageSize {
  width: number
  height: number
}

/**
 * Размеры из заголовка — до декодирования.
 *
 * Разбор идёт по сегментам с учётом их длин, а не поиском байтов по всему файлу: у JPEG
 * внутри EXIF может лежать миниатюра со своим SOF, и наивный поиск нашёл бы её размеры.
 * `null` означает «не смогли прочитать»; вызывающий обязан считать это отказом, иначе
 * сломанный заголовок станет способом обойти проверку.
 */
export function readImageSize(bytes: Uint8Array): ImageSize | null {
  const format = detectImageFormat(bytes)
  if (format === 'png') return readPngSize(bytes)
  if (format === 'jpeg') return readJpegSize(bytes)
  return null
}

export function isWithinPixelBudget(size: ImageSize): boolean {
  return (
    Number.isInteger(size.width) &&
    Number.isInteger(size.height) &&
    size.width > 0 &&
    size.height > 0 &&
    size.width * size.height <= MAX_IMAGE_PIXELS
  )
}

/** IHDR у PNG всегда первый чанк: 8 байт сигнатуры, 4 длина, 4 тип, дальше ширина и высота. */
function readPngSize(bytes: Uint8Array): ImageSize | null {
  if (bytes.length < 24) return null
  const isIhdr =
    bytes[12] === 0x49 && bytes[13] === 0x48 && bytes[14] === 0x44 && bytes[15] === 0x52
  if (!isIhdr) return null

  const view = viewOf(bytes)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

/** Первый SOF в потоке сегментов. Всё, что до него, пропускается по объявленной длине. */
function readJpegSize(bytes: Uint8Array): ImageSize | null {
  const view = viewOf(bytes)
  let offset = 2

  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) return null

    let marker = bytes[offset + 1]
    // Между сегментами допустимы байты-заполнители 0xFF.
    while (marker === 0xff && offset + 2 < bytes.length) {
      offset += 1
      marker = bytes[offset + 1]
    }

    // Маркеры без полезной нагрузки.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2
      continue
    }
    // Начало сжатых данных или конец файла: SOF уже не встретится.
    if (marker === 0xda || marker === 0xd9) return null

    const length = view.getUint16(offset + 2)
    if (length < 2) return null

    const isStartOfFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    if (isStartOfFrame) {
      if (offset + 9 > bytes.length) return null
      return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) }
    }

    offset += 2 + length
  }

  return null
}

function viewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
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

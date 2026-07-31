import { describe, expect, test } from 'bun:test'

import {
  detectImageFormat,
  isWithinPixelBudget,
  isWithinUploadLimit,
  MAX_IMAGE_PIXELS,
  MAX_UPLOAD_BYTES,
  readImageSize,
} from './image'

describe('detectImageFormat', () => {
  test('recognizes a JPEG by its SOI marker', () => {
    expect(detectImageFormat(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toBe('jpeg')
  })

  test('recognizes a PNG by its full 8-byte signature', () => {
    expect(
      detectImageFormat(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])),
    ).toBe('png')
  })

  test('rejects a WebP container — the client must convert it first', () => {
    // "RIFF....WEBP"
    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])
    expect(detectImageFormat(webp)).toBeNull()
  })

  test('rejects a file whose bytes do not match any accepted format', () => {
    expect(detectImageFormat(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBeNull()
    expect(detectImageFormat(new Uint8Array([]))).toBeNull()
  })

  test('does not trust a JPEG extension when the bytes say otherwise', () => {
    // Первые байты PNG, даже если файл назвали photo.jpg — доверяем сигнатуре.
    expect(detectImageFormat(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(
      'png',
    )
  })
})

describe('isWithinUploadLimit', () => {
  test('accepts sizes from 1 byte up to the 10 MB cap', () => {
    expect(isWithinUploadLimit(1)).toBe(true)
    expect(isWithinUploadLimit(MAX_UPLOAD_BYTES)).toBe(true)
  })

  test('rejects empty and oversized uploads', () => {
    expect(isWithinUploadLimit(0)).toBe(false)
    expect(isWithinUploadLimit(MAX_UPLOAD_BYTES + 1)).toBe(false)
  })
})

function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
  const view = new DataView(bytes.buffer)
  view.setUint32(8, 13)
  bytes.set([0x49, 0x48, 0x44, 0x52], 12) // IHDR
  view.setUint32(16, width)
  view.setUint32(20, height)
  return bytes
}

/** JPEG: SOI, затем сегмент `marker` с полезной нагрузкой, затем SOF0 с размерами. */
function jpegWithSegment(marker: number, payload: Uint8Array, width: number, height: number) {
  const sof = new Uint8Array(11)
  sof.set([0xff, 0xc0, 0x00, 0x11, 0x08], 0)
  new DataView(sof.buffer).setUint16(5, height)
  new DataView(sof.buffer).setUint16(7, width)

  const segment = new Uint8Array(4 + payload.length)
  segment.set([0xff, marker], 0)
  new DataView(segment.buffer).setUint16(2, payload.length + 2)
  segment.set(payload, 4)

  const bytes = new Uint8Array(2 + segment.length + sof.length)
  bytes.set([0xff, 0xd8], 0)
  bytes.set(segment, 2)
  bytes.set(sof, 2 + segment.length)
  return bytes
}

describe('readImageSize', () => {
  test('reads dimensions from the PNG IHDR chunk', () => {
    expect(readImageSize(pngHeader(1600, 1200))).toEqual({ width: 1600, height: 1200 })
  })

  test('reads dimensions from the first JPEG start-of-frame', () => {
    expect(readImageSize(jpegWithSegment(0xe0, new Uint8Array([0x4a, 0x46]), 800, 600))).toEqual({
      width: 800,
      height: 600,
    })
  })

  test('skips an EXIF thumbnail that carries its own frame header', () => {
    // Внутри APP1 лежит целый JPEG-миниатюра со своим SOF0 на 160×120. Поиск байтов по
    // всему файлу нашёл бы её и пропустил бомбу; разбор по длинам сегментов — нет.
    const thumbnail = new Uint8Array([
      0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x78, 0x00, 0xa0,
    ])
    const size = readImageSize(jpegWithSegment(0xe1, thumbnail, 6000, 6000))
    expect(size).toEqual({ width: 6000, height: 6000 })
  })

  test('returns null when the header cannot be parsed', () => {
    expect(readImageSize(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBeNull()
    expect(readImageSize(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBeNull()
  })
})

describe('isWithinPixelBudget', () => {
  test('accepts a 12 MP phone photo and the budget itself', () => {
    expect(isWithinPixelBudget({ width: 4032, height: 3024 })).toBe(true)
    expect(isWithinPixelBudget({ width: MAX_IMAGE_PIXELS / 1000, height: 1000 })).toBe(true)
  })

  test('rejects a decompression bomb that weighs nothing on disk', () => {
    // 144 КБ файла, 6000×6000 после декодирования — 535 МБ RSS на контейнере с 1 ГБ.
    expect(isWithinPixelBudget({ width: 6000, height: 6000 })).toBe(false)
    expect(isWithinPixelBudget({ width: MAX_IMAGE_PIXELS / 1000 + 1, height: 1000 })).toBe(false)
    expect(isWithinPixelBudget({ width: 0, height: 100 })).toBe(false)
  })
})

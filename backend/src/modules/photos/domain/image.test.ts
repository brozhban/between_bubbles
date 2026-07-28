import { describe, expect, test } from 'bun:test'

import { detectImageFormat, isWithinUploadLimit, MAX_UPLOAD_BYTES } from './image'

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

import { describe, expect, test } from 'bun:test'
import { Jimp, JimpMime } from 'jimp'

import { PhotoFailure } from '../domain/errors'
import { FULL_MAX_DIMENSION, THUMB_MAX_DIMENSION } from '../domain/image'
import { createJimpImageProcessor } from './image-processor'

const processor = createJimpImageProcessor()

async function makeJpeg(width: number, height: number): Promise<Uint8Array> {
  const image = new Jimp({ width, height, color: 0xaa5533ff })
  return image.getBuffer(JimpMime.jpeg)
}

describe('image processor', () => {
  test('shrinks a large image to the 1600px long side and a 400px thumbnail', async () => {
    const source = await makeJpeg(4000, 2000)

    const result = await processor.process(source)

    expect(result.mimeType).toBe('image/jpeg')
    expect(Math.max(result.full.width, result.full.height)).toBe(FULL_MAX_DIMENSION)
    // Пропорции сохраняются: 4000×2000 → 1600×800.
    expect(result.full.height).toBe(800)

    const thumb = await Jimp.fromBuffer(Buffer.from(result.thumb.bytes))
    expect(Math.max(thumb.width, thumb.height)).toBe(THUMB_MAX_DIMENSION)
  })

  test('rejects a decompression bomb before decoding it', async () => {
    // Заголовок PNG на 6000×6000 без единого байта пиксельных данных. Отказ обязан
    // наступить до `Jimp.read`: развернуть такой растр — 535 МБ на контейнере с 1 ГБ,
    // то есть один запрос кладёт API для всех. Поэтому проверяем и скорость отказа.
    const header = new Uint8Array(24)
    header.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
    const view = new DataView(header.buffer)
    view.setUint32(8, 13)
    header.set([0x49, 0x48, 0x44, 0x52], 12)
    view.setUint32(16, 6000)
    view.setUint32(20, 6000)

    const startedAt = performance.now()
    await expect(processor.process(header)).rejects.toThrow(PhotoFailure)
    expect(performance.now() - startedAt).toBeLessThan(100)
  })

  test('rejects an image whose header cannot be read at all', async () => {
    // Сигнатура на месте, заголовка нет: без размеров пропускать нельзя, иначе битый
    // заголовок становится способом обойти бюджет пикселей.
    const signatureOnly = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

    await expect(processor.process(signatureOnly)).rejects.toThrow(PhotoFailure)
  })

  test('never enlarges an image already smaller than the limits', async () => {
    const source = await makeJpeg(300, 200)

    const result = await processor.process(source)

    expect(result.full.width).toBe(300)
    expect(result.full.height).toBe(200)
  })

  test('strips an EXIF block with GPS coordinates out of the result', async () => {
    // Прошлая версия теста собирала исходник через Jimp, где EXIF нет вовсе, и проверяла
    // отсутствие того, чего не было. Здесь метаданные кладутся в файл руками: сегмент APP1
    // с маркером «Exif» и узнаваемой строкой внутри — так проверяется само вырезание,
    // а не свойство конструктора.
    const secret = 'GPS-41.6938-44.8015'
    const withExif = withExifSegment(await makeJpeg(80, 60), secret)

    expect(Buffer.from(withExif).includes('Exif')).toBe(true)
    expect(Buffer.from(withExif).includes(secret)).toBe(true)

    const result = await processor.process(withExif)
    const output = Buffer.from(result.full.bytes)

    expect(output.includes(secret)).toBe(false)
    expect(output.includes('Exif')).toBe(false)
    expect(hasSegment(result.full.bytes, 0xe1)).toBe(false)
  })

  test('rejects bytes that are not an accepted image', async () => {
    const notAnImage = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]) // "%PDF-"

    await expect(processor.process(notAnImage)).rejects.toBeInstanceOf(PhotoFailure)
  })

  test('rejects an empty upload', async () => {
    await expect(processor.process(new Uint8Array([]))).rejects.toBeInstanceOf(PhotoFailure)
  })
})

/** Вставляет сегмент APP1 с заголовком EXIF сразу после SOI — так его пишут камеры. */
function withExifSegment(jpeg: Uint8Array, payload: string): Uint8Array {
  const header = Buffer.from('Exif\0\0', 'binary')
  const body = Buffer.concat([header, Buffer.from(payload, 'binary')])
  const segment = Buffer.alloc(4 + body.length)
  segment[0] = 0xff
  segment[1] = 0xe1
  segment.writeUInt16BE(body.length + 2, 2)
  body.copy(segment, 4)

  return Buffer.concat([Buffer.from(jpeg.subarray(0, 2)), segment, Buffer.from(jpeg.subarray(2))])
}

/** Есть ли в потоке сегмент с указанным маркером — разбором по длинам, а не поиском байтов. */
function hasSegment(jpeg: Uint8Array, marker: number): boolean {
  const view = new DataView(jpeg.buffer, jpeg.byteOffset, jpeg.byteLength)
  let offset = 2

  while (offset + 3 < jpeg.length) {
    if (jpeg[offset] !== 0xff) return false
    const current = jpeg[offset + 1]
    if (current === marker) return true
    if (current === 0xda || current === 0xd9) return false
    offset += 2 + view.getUint16(offset + 2)
  }

  return false
}

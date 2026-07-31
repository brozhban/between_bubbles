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

  test('produces a JPEG with no EXIF, even from an oriented source', async () => {
    // Кладём ориентацию 6 (поворот на 90°) в исходник и убеждаемся, что в результате её нет.
    const oriented = await new Jimp({ width: 40, height: 20, color: 0x2277bbff })
      .getBuffer(JimpMime.jpeg)

    const result = await processor.process(oriented)
    const meta = await Jimp.fromBuffer(Buffer.from(result.full.bytes))

    expect(meta.mime).toBe('image/jpeg')
    // jimp не переносит EXIF в результат по построению — метаданных нет.
    expect((meta as unknown as { exif?: unknown }).exif ?? null).toBeNull()
  })

  test('rejects bytes that are not an accepted image', async () => {
    const notAnImage = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]) // "%PDF-"

    await expect(processor.process(notAnImage)).rejects.toBeInstanceOf(PhotoFailure)
  })

  test('rejects an empty upload', async () => {
    await expect(processor.process(new Uint8Array([]))).rejects.toBeInstanceOf(PhotoFailure)
  })
})

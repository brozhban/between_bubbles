import { describe, expect, test } from 'bun:test'

import { imageFromPaste } from '../src/features/diary/clipboard-image'

const photo = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'bottle.jpg', { type: 'image/jpeg' })

const imageItem = { kind: 'file', type: 'image/png', getAsFile: () => photo }
const textItem = { kind: 'string', type: 'text/plain', getAsFile: () => null }

/**
 * Вставка слушает весь документ, поэтому ошибка в этом правиле крадёт у человека обычную
 * вставку текста в «Заметки» или в название вина.
 */
describe('imageFromPaste', () => {
  test('забирает картинку, вставленную вне текстового поля', () => {
    expect(
      imageFromPaste({ items: [imageItem], types: ['Files'], targetIsEditable: false }),
    ).toBe(photo)
  })

  test('забирает чистую картинку даже из текстового поля — текст туда она не вставит', () => {
    expect(
      imageFromPaste({ items: [imageItem], types: ['Files'], targetIsEditable: true }),
    ).toBe(photo)
  })

  test('отдаёт текстовому полю вставку, где есть и текст, и картинка', () => {
    expect(
      imageFromPaste({
        items: [textItem, imageItem],
        types: ['text/plain', 'Files'],
        targetIsEditable: true,
      }),
    ).toBeNull()
  })

  test('не реагирует на вставку обычного текста', () => {
    expect(
      imageFromPaste({ items: [textItem], types: ['text/plain'], targetIsEditable: false }),
    ).toBeNull()
  })

  test('пропускает файлы, которые не картинки', () => {
    const pdf = { kind: 'file', type: 'application/pdf', getAsFile: () => photo }
    expect(imageFromPaste({ items: [pdf], types: ['Files'], targetIsEditable: false })).toBeNull()
  })
})

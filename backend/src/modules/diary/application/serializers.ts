import type { EntryDto, EntryListItemDto, WineDto, WineListItemDto } from '@between-bubbles/contracts'

import type { ExportEntry } from '../domain/export'
import { glassesFromMl, type MetricEntry } from '../domain/metrics'
import type { StatsEntry } from '../domain/stats'
import type { EntryRecord, WineListRow, WineRecord } from './ports'

/**
 * Записи хранилища → DTO контрактов и входные формы домена.
 *
 * Фото в DTO подставляет сервис: они приезжают из модуля `photos` уже подписанными
 * ссылками, а сериализатор о хранилище ничего не знает.
 */

export function toWineDto(wine: WineRecord): WineDto {
  return {
    id: wine.id,
    name: wine.name,
    type: wine.type,
    producer: wine.producer,
    originCountry: wine.originCountry,
    region: wine.region,
    grapes: wine.grapes,
    vintage: wine.vintage,
    abv: wine.abv,
    sugar: wine.sugar,
    createdAt: wine.createdAt.toISOString(),
  }
}

export function toWineListItemDto(row: WineListRow): WineListItemDto {
  return {
    ...toWineDto(row),
    tastingCount: row.tastingCount,
    averageRating: row.averageRating,
    lastTastedOn: row.lastTastedOn,
    thumbUrl: null,
  }
}

export function toEntryDto(entry: EntryRecord): EntryDto {
  return {
    id: entry.id,
    wine: toWineDto(entry.wine),
    weekId: entry.weekId,
    tastedOn: entry.tastedOn,
    volumeMl: entry.volumeMl,
    glasses: glassesFromMl(entry.volumeMl),
    rating: entry.rating,
    price: entry.price,
    currency: entry.currency,
    purchaseCountry: entry.purchaseCountry,
    store: entry.store
      ? {
          id: entry.store.id,
          name: entry.store.name,
          countryCode: entry.store.countryCode,
          city: entry.store.city,
        }
      : null,
    body: entry.body,
    acidity: entry.acidity,
    tannins: entry.tannins,
    tasteCategory: entry.tasteCategory,
    aftertaste: entry.aftertaste,
    notes: entry.notes,
    aromas: entry.aromas.map((aroma) => ({
      id: aroma.id,
      nameRu: aroma.nameRu,
      nameEn: aroma.nameEn,
      isSystem: aroma.isSystem,
    })),
    photos: [],
    sameBottleOfId: entry.sameBottleOfId,
    deletedAt: entry.deletedAt?.toISOString() ?? null,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  }
}

export function toEntryListItemDto(entry: EntryRecord): EntryListItemDto {
  return {
    id: entry.id,
    wineId: entry.wine.id,
    wineName: entry.wine.name,
    wineType: entry.wine.type,
    tastedOn: entry.tastedOn,
    volumeMl: entry.volumeMl,
    glasses: glassesFromMl(entry.volumeMl),
    rating: entry.rating,
    price: entry.price,
    currency: entry.currency,
    tasteCategory: entry.tasteCategory,
    isSameBottleRepeat: entry.sameBottleOfId !== null,
    thumbUrl: null,
  }
}

/** Запись хранилища → строка выгрузки (ТЗ §14). Цена и магазин в файл идут: это свои данные. */
export function toExportEntry(entry: EntryRecord): ExportEntry {
  return {
    id: entry.id,
    tastedOn: entry.tastedOn,
    volumeMl: entry.volumeMl,
    rating: entry.rating,
    price: entry.price,
    currency: entry.currency,
    purchaseCountry: entry.purchaseCountry,
    storeName: entry.store?.name ?? null,
    storeCountryCode: entry.store?.countryCode ?? null,
    storeCity: entry.store?.city ?? null,
    wineName: entry.wine.name,
    wineProducer: entry.wine.producer,
    wineType: entry.wine.type,
    wineSugar: entry.wine.sugar,
    wineOriginCountry: entry.wine.originCountry,
    wineRegion: entry.wine.region,
    wineGrapes: entry.wine.grapes,
    wineVintage: entry.wine.vintage,
    wineAbv: entry.wine.abv,
    body: entry.body,
    acidity: entry.acidity,
    tannins: entry.tannins,
    tasteCategory: entry.tasteCategory,
    aftertaste: entry.aftertaste,
    aromas: entry.aromas.map((aroma) => ({ nameRu: aroma.nameRu, nameEn: aroma.nameEn })),
    notes: entry.notes,
    isSameBottleRepeat: entry.sameBottleOfId !== null,
    photoCount: entry.photos.length,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  }
}

/** Запись хранилища → вход статистики: к метрикам недели добавляются страна и сорта (ТЗ §10.9). */
export function toStatsEntry(entry: EntryRecord): StatsEntry {
  return {
    ...toMetricEntry(entry),
    originCountry: entry.wine.originCountry,
    grapes: entry.wine.grapes,
  }
}

export function toMetricEntry(entry: EntryRecord): MetricEntry {
  return {
    id: entry.id,
    wineId: entry.wine.id,
    wineName: entry.wine.name,
    wineType: entry.wine.type,
    tastedOn: entry.tastedOn,
    volumeMl: entry.volumeMl,
    rating: entry.rating,
    price: entry.price,
    currency: entry.currency,
    tasteCategory: entry.tasteCategory,
    isSameBottleRepeat: entry.sameBottleOfId !== null,
  }
}

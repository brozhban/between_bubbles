import type {
  AromaTagDto,
  EntryCreatePayload,
  EntryDto,
  EntryListItemDto,
  EntryPhotoDto,
  EntryUpdatePayload,
  Locale,
  StatsQuery,
  StatsResponse,
  TrashListResponse,
  WeekResponse,
  WineDto,
  WineListQuery,
  WineListResponse,
} from '@between-bubbles/contracts'

import {
  isFutureDate,
  startOfWeek,
  todayIn,
  weekBoundaries,
  type CalendarDate,
} from '../domain/calendar'
import { DiaryFailure } from '../domain/errors'
import {
  buildCsvExport,
  buildJsonExport,
  exportContentType,
  exportFileName,
  type ExportFormat,
} from '../domain/export'
import {
  averageWineRating,
  categoryDistribution,
  dayBreakdown,
  glassesFromMl,
  spendByCurrency,
  totalMl,
  typeDistribution,
  weekMetrics,
} from '../domain/metrics'
import {
  countryDistribution,
  grapeDistribution,
  statsPeriodStart,
  topWines,
  weeklyDynamics,
} from '../domain/stats'
import type {
  Clock,
  DiaryRepository,
  EntryFields,
  EntryRecord,
  WineSelection,
} from './ports'
import {
  toEntryDto,
  toEntryListItemDto,
  toExportEntry,
  toMetricEntry,
  toStatsEntry,
  toWineDto,
  toWineListItemDto,
} from './serializers'
import type { StoreService } from './store-service'

/** Владелец запроса. Настройки берём из сессии — отдельного чтения профиля не нужно. */
export type DiaryActor = {
  id: string
  timezone: string
  showSpendTotals: boolean
  /** Язык интерфейса: на нём подписываются колонки выгрузки (ТЗ §14). */
  locale: Locale
}

/**
 * Фото приезжают из модуля `photos` через этот порт: дневник не знает про хранилище и
 * получает уже подписанные ссылки. Порт необязателен — без него записи просто без фото
 * (так работают юнит-тесты и любая среда без хранилища).
 */
export type EntryPhotos = {
  photosForEntries(input: {
    userId: string
    entryIds: readonly string[]
  }): Promise<Map<string, EntryPhotoDto[]>>
}

/** Удаление файлов из хранилища при окончательном удалении записей (ТЗ §7.6). */
export type PhotoFileCleaner = {
  removeStoredFiles(photos: ReadonlyArray<{ storageKey: string; thumbKey: string }>): Promise<void>
}

type DiaryServiceDependencies = {
  clock: Clock
  repository: DiaryRepository
  stores: StoreService
  photos?: EntryPhotos
  photoFiles?: PhotoFileCleaner
}

export class DiaryService {
  constructor(private readonly deps: DiaryServiceDependencies) {}

  /**
   * Неделя главного экрана. Пустая неделя отдаётся вычисленной, но без `weekId` и без метрик:
   * строки в БД для неё не создаётся, пока не появится первая запись (ТЗ §6).
   */
  async getWeek(actor: DiaryActor, date?: CalendarDate): Promise<WeekResponse> {
    const today = todayIn(actor.timezone, this.deps.clock.now())
    const boundaries = weekBoundaries(date ?? today)
    // Последовательно, а не через Promise.all: драйвер pg не выполняет параллельные запросы
    // на одном соединении и предупреждает об этом, а выигрыш на двух индексных чтениях нулевой.
    const week = await this.deps.repository.findWeek({
      userId: actor.id,
      startDate: boundaries.startDate,
    })
    const entries = await this.deps.repository.listWeekEntries({
      userId: actor.id,
      startDate: boundaries.startDate,
      endDate: boundaries.endDate,
    })

    const metricEntries = entries.map(toMetricEntry)

    return {
      weekId: week?.id ?? null,
      startDate: boundaries.startDate,
      endDate: boundaries.endDate,
      isoYear: boundaries.isoYear,
      isoWeek: boundaries.isoWeek,
      isCurrent: boundaries.startDate === startOfWeek(today),
      metrics:
        entries.length === 0
          ? null
          : weekMetrics(metricEntries, { showSpendTotals: actor.showSpendTotals }),
      days: dayBreakdown(boundaries.startDate, metricEntries),
      entries: await this.withThumbnails(actor.id, entries.map(toEntryListItemDto)),
    }
  }

  async getEntry(actor: DiaryActor, entryId: string): Promise<EntryDto> {
    const entry = await this.deps.repository.findEntry({ userId: actor.id, entryId })
    if (!entry) throw entryNotFound()

    const photos = await this.photosFor(actor.id, [entry.id])
    return { ...toEntryDto(entry), photos: photos.get(entry.id) ?? [] }
  }

  /**
   * Чтение записи для публичной страницы (ТЗ §12): без актора, только по владельцу из ссылки.
   * Отдаёт null вместо ошибки — публикация сама решает, что показать вместо пропавшей записи.
   */
  async findEntryForSharing(input: { userId: string; entryId: string }): Promise<EntryDto | null> {
    const entry = await this.deps.repository.findEntry(input)
    if (!entry) return null

    const photos = await this.photosFor(input.userId, [entry.id])
    return { ...toEntryDto(entry), photos: photos.get(entry.id) ?? [] }
  }

  async createEntry(actor: DiaryActor, payload: EntryCreatePayload): Promise<EntryDto> {
    this.assertNotInFuture(actor, payload.tastedOn)

    const storeId = await this.resolveStoreId(actor, payload.store)
    const entry = await this.deps.repository.createEntry({
      userId: actor.id,
      week: weekBoundaries(payload.tastedOn),
      wine: toWineSelection(payload.wine),
      fields: toEntryFields(payload, storeId),
      aromaTagIds: payload.aromaTagIds,
      newAromaTags: payload.newAromaTags,
    })

    return toEntryDto(entry)
  }

  /**
   * Дата определяет неделю: при её смене запись переезжает в свою неделю и, если нужно,
   * создаёт её (ТЗ §6). Прошлые недели редактируются наравне с текущей.
   */
  async updateEntry(
    actor: DiaryActor,
    entryId: string,
    payload: EntryUpdatePayload,
  ): Promise<EntryDto> {
    if (payload.tastedOn !== undefined) {
      this.assertNotInFuture(actor, payload.tastedOn)
    }

    const storeId =
      payload.store === undefined ? undefined : await this.resolveStoreId(actor, payload.store)

    const entry = await this.deps.repository.updateEntry({
      userId: actor.id,
      entryId,
      week: payload.tastedOn === undefined ? null : weekBoundaries(payload.tastedOn),
      wine: payload.wine === undefined ? null : toWineSelection(payload.wine),
      fields: toPartialEntryFields(payload, storeId),
      aromaTagIds: payload.aromaTagIds ?? null,
      newAromaTags: payload.newAromaTags ?? [],
    })

    if (!entry) throw entryNotFound()
    return toEntryDto(entry)
  }

  /**
   * Удаление мягкое: запись уходит в корзину и выпадает из всех метрик (ТЗ §7.6).
   * Возвращаем саму запись, чтобы клиент показал «Отменить» без повторного запроса.
   */
  async deleteEntry(actor: DiaryActor, entryId: string): Promise<EntryDto> {
    const deleted = await this.deps.repository.softDeleteEntry({
      userId: actor.id,
      entryId,
      now: this.deps.clock.now(),
    })
    if (!deleted) throw entryNotFound()
    return toEntryDto(deleted)
  }

  async restoreEntry(actor: DiaryActor, entryId: string): Promise<EntryDto> {
    const entry = await this.deps.repository.restoreEntry({ userId: actor.id, entryId })
    if (!entry) throw entryNotFound()
    return toEntryDto(entry)
  }

  async purgeEntry(actor: DiaryActor, entryId: string): Promise<{ id: string }> {
    const photos = await this.deps.repository.purgeEntry({ userId: actor.id, entryId })
    if (photos === null) throw entryNotFound()
    // Окончательное удаление записи удаляет и её фото из хранилища (ТЗ §7.6).
    await this.deps.photoFiles?.removeStoredFiles(photos)
    return { id: entryId }
  }

  async listTrash(actor: DiaryActor): Promise<TrashListResponse> {
    const entries = await this.deps.repository.listTrash({ userId: actor.id })
    const withThumbs = await this.withThumbnails(actor.id, entries.map(toEntryListItemDto))
    return {
      items: withThumbs.map((item, index) => ({
        ...item,
        deletedAt: entries[index]!.deletedAt.toISOString(),
      })),
    }
  }

  /**
   * Статистика за период (ТЗ §10.9). Границы календарные и считаются в таймзоне пользователя:
   * «этот месяц» должен заканчиваться там же, где заканчивается его сегодня.
   */
  async getStats(actor: DiaryActor, query: StatsQuery): Promise<StatsResponse> {
    const today = todayIn(actor.timezone, this.deps.clock.now())
    const startDate = statsPeriodStart(query.period, today)
    const records = await this.deps.repository.listAllEntries({
      userId: actor.id,
      from: startDate ?? undefined,
    })
    const entries = records.map(toStatsEntry)
    const ml = totalMl(entries)

    return {
      period: query.period,
      startDate,
      endDate: today,
      totalEntries: entries.length,
      totalGlasses: glassesFromMl(ml),
      totalMl: ml,
      topWines: topWines(entries),
      typeDistribution: typeDistribution(entries),
      categoryDistribution: categoryDistribution(entries),
      countryDistribution: countryDistribution(entries),
      grapeDistribution: grapeDistribution(entries),
      weeks: weeklyDynamics(entries),
      spendByCurrency: actor.showSpendTotals ? spendByCurrency(entries) : null,
    }
  }

  /**
   * Выгрузка дневника (ТЗ §14).
   *
   * Файл собирается прямо в ответе, а не фоновой задачей со ссылкой на скачивание, как
   * описано в ТЗ: дневник на тысячу записей — это сотни килобайт и миллисекунды работы,
   * и очередь с временным файлом здесь добавила бы движущихся частей больше, чем пользы.
   * Если дневники когда-нибудь вырастут до размеров, где ответ не помещается в запрос,
   * тот же сериализатор переедет в фоновую задачу без изменений.
   */
  async exportEntries(
    actor: DiaryActor,
    format: ExportFormat,
  ): Promise<{ fileName: string; contentType: string; body: string }> {
    const records = await this.deps.repository.listAllEntries({ userId: actor.id })
    const entries = records.map(toExportEntry)
    const exportedAt = this.deps.clock.now()

    return {
      fileName: exportFileName(format, exportedAt),
      contentType: exportContentType(format),
      body:
        format === 'csv'
          ? buildCsvExport({ entries, locale: actor.locale })
          : buildJsonExport({ entries, exportedAt }),
    }
  }

  async emptyTrash(actor: DiaryActor): Promise<{ purgedEntries: number }> {
    const { purgedEntries, photos } = await this.deps.repository.purgeTrash({ userId: actor.id })
    await this.deps.photoFiles?.removeStoredFiles(photos)
    return { purgedEntries }
  }

  async listWines(actor: DiaryActor, query: WineListQuery): Promise<WineListResponse> {
    const rows = await this.deps.repository.listWines({
      userId: actor.id,
      filters: {
        search: query.search,
        type: query.type,
        ratingMin: query.ratingMin,
        ratingMax: query.ratingMax,
        sort: query.sort,
        order: query.order,
        limit: query.limit + 1,
        cursor: query.cursor,
      },
    })

    const hasMore = rows.length > query.limit
    const page = hasMore ? rows.slice(0, query.limit) : rows

    return {
      items: page.map(toWineListItemDto),
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
    }
  }

  /** Карточка вина: данные вина, средний рейтинг по всем дегустациям и сами дегустации. */
  async getWine(
    actor: DiaryActor,
    wineId: string,
  ): Promise<{
    wine: WineDto
    averageRating: number | null
    tastings: EntryListItemDto[]
  }> {
    const wine = await this.deps.repository.findWine({ userId: actor.id, wineId })
    if (!wine) throw new DiaryFailure('not_found', 'Wine not found')

    const tastings = await this.deps.repository.listWineEntries({ userId: actor.id, wineId })

    return {
      wine: toWineDto(wine),
      averageRating: averageWineRating(tastings.map((entry) => entry.rating)),
      tastings: await this.withThumbnails(actor.id, tastings.map(toEntryListItemDto)),
    }
  }

  /** Вино удаляется только когда у него не осталось активных записей (ТЗ §7.6). */
  async deleteWine(actor: DiaryActor, wineId: string): Promise<{ id: string }> {
    const result = await this.deps.repository.deleteWine({ userId: actor.id, wineId })

    if (result === 'missing') throw new DiaryFailure('not_found', 'Wine not found')
    if (result === 'in_use') {
      throw new DiaryFailure('wine_in_use', 'Wine still has tasting entries')
    }

    return { id: wineId }
  }

  async listAromaTags(actor: DiaryActor): Promise<AromaTagDto[]> {
    return this.deps.repository.listAromaTags({ userId: actor.id })
  }

  async createAromaTag(actor: DiaryActor, name: string): Promise<AromaTagDto> {
    return this.deps.repository.createAromaTag({ userId: actor.id, name })
  }

  private photosFor(userId: string, entryIds: readonly string[]) {
    if (!this.deps.photos || entryIds.length === 0) {
      return Promise.resolve(new Map<string, EntryPhotoDto[]>())
    }
    return this.deps.photos.photosForEntries({ userId, entryIds })
  }

  /** Проставляет миниатюру первого фото в строки списка; без модуля фото — оставляет null. */
  private async withThumbnails<T extends { id: string; thumbUrl: string | null }>(
    userId: string,
    items: T[],
  ): Promise<T[]> {
    if (!this.deps.photos || items.length === 0) return items

    const photos = await this.photosFor(
      userId,
      items.map((item) => item.id),
    )
    return items.map((item) => ({
      ...item,
      thumbUrl: photos.get(item.id)?.[0]?.thumbUrl ?? null,
    }))
  }

  private assertNotInFuture(actor: DiaryActor, date: CalendarDate) {
    if (isFutureDate(date, actor.timezone, this.deps.clock.now())) {
      throw new DiaryFailure('invalid_input', 'Tasting date cannot be in the future')
    }
  }

  private async resolveStoreId(
    actor: DiaryActor,
    store: EntryCreatePayload['store'],
  ): Promise<string | null> {
    if (!store) return null
    return this.deps.stores.resolve(actor.id, store)
  }
}

function entryNotFound() {
  return new DiaryFailure('not_found', 'Tasting entry not found')
}

function toWineSelection(wine: EntryCreatePayload['wine']): WineSelection {
  return wine.mode === 'existing'
    ? { mode: 'existing', wineId: wine.wineId }
    : { mode: 'new', wine: wine.wine }
}

function toEntryFields(payload: EntryCreatePayload, storeId: string | null): EntryFields {
  return {
    tastedOn: payload.tastedOn,
    volumeMl: payload.volumeMl,
    rating: payload.rating,
    price: payload.price,
    currency: payload.currency,
    purchaseCountry: payload.purchaseCountry,
    storeId,
    body: payload.body,
    acidity: payload.acidity,
    tannins: payload.tannins,
    tasteCategory: payload.tasteCategory,
    aftertaste: payload.aftertaste,
    notes: payload.notes,
    sameBottleOfId: payload.sameBottleOfId ?? null,
  }
}

function toPartialEntryFields(
  payload: EntryUpdatePayload,
  storeId: string | null | undefined,
): Partial<EntryFields> {
  const fields: Partial<EntryFields> = {}

  if (payload.tastedOn !== undefined) fields.tastedOn = payload.tastedOn
  if (payload.volumeMl !== undefined) fields.volumeMl = payload.volumeMl
  if (payload.rating !== undefined) fields.rating = payload.rating
  if (payload.price !== undefined) fields.price = payload.price
  if (payload.currency !== undefined) fields.currency = payload.currency
  if (payload.purchaseCountry !== undefined) fields.purchaseCountry = payload.purchaseCountry
  if (storeId !== undefined) fields.storeId = storeId
  if (payload.body !== undefined) fields.body = payload.body
  if (payload.acidity !== undefined) fields.acidity = payload.acidity
  if (payload.tannins !== undefined) fields.tannins = payload.tannins
  if (payload.tasteCategory !== undefined) fields.tasteCategory = payload.tasteCategory
  if (payload.aftertaste !== undefined) fields.aftertaste = payload.aftertaste
  if (payload.notes !== undefined) fields.notes = payload.notes
  if (payload.sameBottleOfId !== undefined) fields.sameBottleOfId = payload.sameBottleOfId

  return fields
}

export type { EntryRecord }

import {
  aromaTagListResponseSchema,
  aromaTagSchema,
  deletedResourceSchema,
  entryCreateSchema,
  entryPhotoResponseSchema,
  entryResponseSchema,
  entryUpdateSchema,
  shareLinkResponseSchema,
  shareLinkSchema,
  statsResponseSchema,
  storeCreateSchema,
  storeSchema,
  storeSearchResponseSchema,
  trashListResponseSchema,
  trashPurgeResponseSchema,
  weekResponseSchema,
  wineDetailResponseSchema,
  wineListResponseSchema,
  type EntryCreateRequest,
  type EntryUpdateRequest,
  type ExportFormat,
  type PhotoKind,
  type StatsPeriod,
  type StoreCreatePayload,
  type WineListQuery,
} from '@between-bubbles/contracts'

import type { AuthenticatedTransport } from '@/platform/api'

export type WineListParams = Partial<Omit<WineListQuery, 'limit'>> & { limit?: number }

export type StoreSearchParams = {
  q?: string
  country?: string
  limit?: number
}

/**
 * Эндпоинты дневника. Транспорт приходит из auth-контекста и уже умеет обновлять
 * протухший access-токен, поэтому здесь остаются только пути и схемы ответов.
 */
export class DiaryApi {
  private readonly transport: AuthenticatedTransport

  constructor(transport: AuthenticatedTransport) {
    this.transport = transport
  }

  week(date?: string) {
    return this.transport.request(`/api/week${query({ date })}`, weekResponseSchema)
  }

  entry(entryId: string) {
    return this.transport.request(`/api/entries/${entryId}`, entryResponseSchema)
  }

  createEntry(input: EntryCreateRequest) {
    return this.transport.request('/api/entries', entryResponseSchema, {
      method: 'POST',
      body: entryCreateSchema.parse(input),
    })
  }

  updateEntry(entryId: string, input: EntryUpdateRequest) {
    return this.transport.request(`/api/entries/${entryId}`, entryResponseSchema, {
      method: 'PATCH',
      body: entryUpdateSchema.parse(input),
    })
  }

  /** Мягкое удаление. Ответ содержит саму запись — на ней строится «Отменить». */
  trashEntry(entryId: string) {
    return this.transport.request(`/api/entries/${entryId}`, entryResponseSchema, {
      method: 'DELETE',
    })
  }

  restoreEntry(entryId: string) {
    return this.transport.request(`/api/entries/${entryId}/restore`, entryResponseSchema, {
      method: 'POST',
    })
  }

  purgeEntry(entryId: string) {
    return this.transport.request(`/api/entries/${entryId}/permanent`, deletedResourceSchema, {
      method: 'DELETE',
    })
  }

  /**
   * Загрузка фото: тело — уже сжатый на клиенте JPEG, а не multipart. На запрос одна
   * картинка, поэтому оборачивать её в форму значило бы разбирать границы на обеих сторонах.
   */
  uploadPhoto(entryId: string, kind: PhotoKind, bytes: Uint8Array) {
    return this.transport.request(
      `/api/entries/${entryId}/photos${query({ kind })}`,
      entryPhotoResponseSchema,
      {
        method: 'POST',
        rawBody: bytes as unknown as BodyInit,
        contentType: 'application/octet-stream',
      },
    )
  }

  deletePhoto(entryId: string, photoId: string) {
    return this.transport.requestVoid(`/api/entries/${entryId}/photos/${photoId}`, {
      method: 'DELETE',
    })
  }

  /** Публикация записи (ТЗ §12): одна действующая ссылка на запись. */
  share(entryId: string) {
    return this.transport.request(`/api/entries/${entryId}/share`, shareLinkResponseSchema)
  }

  createShare(entryId: string, showName: boolean) {
    return this.transport.request(`/api/entries/${entryId}/share`, shareLinkSchema, {
      method: 'POST',
      body: { showName },
    })
  }

  updateShare(entryId: string, showName: boolean) {
    return this.transport.request(`/api/entries/${entryId}/share`, shareLinkSchema, {
      method: 'PATCH',
      body: { showName },
    })
  }

  revokeShare(entryId: string) {
    return this.transport.requestVoid(`/api/entries/${entryId}/share`, { method: 'DELETE' })
  }

  /** Статистика за период (ТЗ §10.9). */
  stats(period: StatsPeriod) {
    return this.transport.request(`/api/stats${query({ period })}`, statsResponseSchema)
  }

  /** Выгрузка дневника (ТЗ §14). Возвращает файл целиком: генерация синхронная. */
  exportDiary(format: ExportFormat) {
    return this.transport.requestFile(`/api/export${query({ format })}`)
  }

  trash() {
    return this.transport.request('/api/trash', trashListResponseSchema)
  }

  emptyTrash() {
    return this.transport.request('/api/trash', trashPurgeResponseSchema, { method: 'DELETE' })
  }

  wines(params: WineListParams = {}) {
    return this.transport.request(`/api/wines${query(params)}`, wineListResponseSchema)
  }

  wine(wineId: string) {
    return this.transport.request(`/api/wines/${wineId}`, wineDetailResponseSchema)
  }

  deleteWine(wineId: string) {
    return this.transport.request(`/api/wines/${wineId}`, deletedResourceSchema, {
      method: 'DELETE',
    })
  }

  aromaTags() {
    return this.transport.request('/api/aroma-tags', aromaTagListResponseSchema)
  }

  createAromaTag(name: string) {
    return this.transport.request('/api/aroma-tags', aromaTagSchema, {
      method: 'POST',
      body: { name },
    })
  }

  searchStores(params: StoreSearchParams) {
    return this.transport.request(`/api/stores${query(params)}`, storeSearchResponseSchema)
  }

  createStore(input: StoreCreatePayload) {
    return this.transport.request('/api/stores', storeSchema, {
      method: 'POST',
      body: storeCreateSchema.parse(input),
    })
  }
}

function query(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue
    search.set(key, String(value))
  }

  const serialized = search.toString()
  return serialized ? `?${serialized}` : ''
}

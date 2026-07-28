import type {
  Acidity,
  Aftertaste,
  Body,
  Currency,
  PhotoKind,
  StoreKind,
  SugarLevel,
  Tannins,
  TasteCategory,
  WineType,
  WinePayload,
} from '@between-bubbles/contracts'

import type { CalendarDate } from '../domain/calendar'

/**
 * Порты дневника.
 *
 * Единственное правило, ради которого этот слой существует: **каждый метод
 * `DiaryRepository` принимает `userId` и обязан использовать его в `where`**. Чужой id
 * возвращает `null`, а сервис превращает это в 404 — существование записи не раскрывается
 * (ТЗ §2). Записи в общем справочнике магазинов живут в отдельном порте именно потому,
 * что они не пользовательские и это правило к ним не применяется.
 */

export type WineRecord = {
  id: string
  name: string
  type: WineType
  producer: string | null
  originCountry: string | null
  region: string | null
  grapes: string[]
  vintage: number | null
  abv: number | null
  sugar: SugarLevel | null
  createdAt: Date
}

export type AromaTagRecord = {
  id: string
  nameRu: string
  nameEn: string | null
  isSystem: boolean
}

export type PhotoRecord = {
  id: string
  kind: PhotoKind
  storageKey: string
  thumbKey: string
  width: number
  height: number
}

export type StoreRecord = {
  id: string
  name: string
  countryCode: string
  city: string | null
  kind: StoreKind
  usageCount: number
}

export type EntryRecord = {
  id: string
  weekId: string
  wine: WineRecord
  tastedOn: CalendarDate
  volumeMl: number
  rating: number
  price: number | null
  currency: Currency | null
  purchaseCountry: string | null
  store: StoreRecord | null
  body: Body | null
  acidity: Acidity | null
  tannins: Tannins | null
  tasteCategory: TasteCategory | null
  aftertaste: Aftertaste | null
  notes: string | null
  aromas: AromaTagRecord[]
  photos: PhotoRecord[]
  sameBottleOfId: string | null
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export type WeekRecord = {
  id: string
  startDate: CalendarDate
  endDate: CalendarDate
  isoYear: number
  isoWeek: number
}

export type WeekTarget = {
  startDate: CalendarDate
  endDate: CalendarDate
  isoYear: number
  isoWeek: number
}

export type EntryFields = {
  tastedOn: CalendarDate
  volumeMl: number
  rating: number
  price?: number
  currency?: Currency
  purchaseCountry?: string
  storeId?: string | null
  body?: Body
  acidity?: Acidity
  tannins?: Tannins
  tasteCategory?: TasteCategory
  aftertaste?: Aftertaste
  notes?: string
  sameBottleOfId?: string | null
}

export type WineSelection =
  | { mode: 'existing'; wineId: string }
  | { mode: 'new'; wine: WinePayload }

export type WineListFilters = {
  search?: string
  type?: WineType
  ratingMin?: number
  ratingMax?: number
  sort: 'lastTasted' | 'rating' | 'name'
  order: 'asc' | 'desc'
  limit: number
  cursor?: string
}

export type WineListRow = WineRecord & {
  tastingCount: number
  averageRating: number | null
  lastTastedOn: CalendarDate | null
  thumbKey: string | null
}

export type DiaryRepository = {
  findWeek(input: { userId: string; startDate: CalendarDate }): Promise<WeekRecord | null>
  listWeekEntries(input: {
    userId: string
    startDate: CalendarDate
    endDate: CalendarDate
  }): Promise<EntryRecord[]>

  findEntry(input: { userId: string; entryId: string }): Promise<EntryRecord | null>
  createEntry(input: {
    userId: string
    week: WeekTarget
    wine: WineSelection
    fields: EntryFields
    aromaTagIds: string[]
    newAromaTags: string[]
  }): Promise<EntryRecord>
  updateEntry(input: {
    userId: string
    entryId: string
    week: WeekTarget | null
    wine: WineSelection | null
    fields: Partial<EntryFields>
    aromaTagIds: string[] | null
    newAromaTags: string[]
  }): Promise<EntryRecord | null>

  softDeleteEntry(input: {
    userId: string
    entryId: string
    now: Date
  }): Promise<EntryRecord | null>
  restoreEntry(input: { userId: string; entryId: string }): Promise<EntryRecord | null>
  purgeEntry(input: { userId: string; entryId: string }): Promise<PhotoRecord[] | null>
  listTrash(input: { userId: string }): Promise<Array<EntryRecord & { deletedAt: Date }>>
  /**
   * Активные записи от старых к новым. Без `from` — весь дневник: выгрузка (ТЗ §14) берёт
   * его целиком, статистика (ТЗ §10.9) — от начала месяца или года.
   */
  listAllEntries(input: { userId: string; from?: CalendarDate }): Promise<EntryRecord[]>
  purgeTrash(input: {
    userId: string
    deletedBefore?: Date
  }): Promise<{ purgedEntries: number; photos: PhotoRecord[] }>

  findWine(input: { userId: string; wineId: string }): Promise<WineRecord | null>
  listWines(input: { userId: string; filters: WineListFilters }): Promise<WineListRow[]>
  listWineEntries(input: { userId: string; wineId: string }): Promise<EntryRecord[]>
  deleteWine(input: { userId: string; wineId: string }): Promise<'deleted' | 'in_use' | 'missing'>

  listAromaTags(input: { userId: string }): Promise<AromaTagRecord[]>
  createAromaTag(input: { userId: string; name: string }): Promise<AromaTagRecord>
}

export type StoreRepository = {
  search(input: {
    query?: string
    countryCode?: string
    limit: number
  }): Promise<StoreRecord[]>
  listRecentForUser(input: { userId: string; limit: number }): Promise<StoreRecord[]>
  /**
   * Кандидаты для нечёткого сравнения. Отдельный метод от `search`, потому что опечатка
   * («Godwill» вместо «Goodwill») не проходит подстрочный фильтр, а именно её и нужно поймать.
   */
  listForDuplicateCheck(input: { countryCode?: string; limit: number }): Promise<StoreRecord[]>
  findById(input: { storeId: string }): Promise<StoreRecord | null>
  countCreatedSince(input: { userId: string; since: Date }): Promise<number>
  create(input: {
    userId: string
    name: string
    normalizedName: string
    countryCode: string
    city?: string
    kind: StoreKind
  }): Promise<StoreRecord>
}

export type Clock = {
  now(): Date
}

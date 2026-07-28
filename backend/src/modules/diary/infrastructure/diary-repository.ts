import type { DbClient } from '../../../db'
import { systemAromaTags } from '@between-bubbles/contracts'

import type { CalendarDate } from '../domain/calendar'
import { DiaryFailure } from '../domain/errors'
import { averageWineRating } from '../domain/metrics'
import type {
  AromaTagRecord,
  DiaryRepository,
  EntryFields,
  EntryRecord,
  PhotoRecord,
  StoreRecord,
  WeekTarget,
  WineListFilters,
  WineListRow,
  WineRecord,
  WineSelection,
} from '../application/ports'

const entryInclude = {
  wine: true,
  store: true,
  aromas: { include: { tag: true } },
  photos: true,
} as const

/**
 * Prisma-адаптер дневника.
 *
 * Каждый запрос фильтруется по `userId`; чужой объект не «запрещается», а просто не находится,
 * и наверх уходит `null` → 404 (ТЗ §2). Это единственный слой, который знает про Prisma.
 */
export function createPrismaDiaryRepository(db: DbClient): DiaryRepository {
  return {
    async findWeek({ userId, startDate }) {
      const week = await db.week.findFirst({
        where: { userId, startDate: toDbDate(startDate) },
      })
      if (!week) return null

      return {
        id: week.id,
        startDate: toCalendarDate(week.startDate),
        endDate: toCalendarDate(week.endDate),
        isoYear: week.isoYear,
        isoWeek: week.isoWeek,
      }
    },

    async listWeekEntries({ userId, startDate, endDate }) {
      const entries = await db.tastingEntry.findMany({
        where: {
          userId,
          deletedAt: null,
          tastedOn: { gte: toDbDate(startDate), lte: toDbDate(endDate) },
        },
        include: entryInclude,
        orderBy: [{ tastedOn: 'asc' }, { createdAt: 'asc' }],
      })

      return entries.map(toEntryRecord)
    },

    async findEntry({ userId, entryId }) {
      const entry = await db.tastingEntry.findFirst({
        where: { id: entryId, userId, deletedAt: null },
        include: entryInclude,
      })

      return entry ? toEntryRecord(entry) : null
    },

    async createEntry({ userId, week, wine, fields, aromaTagIds, newAromaTags }) {
      return db.$transaction(async (tx) => {
        const wineId = await resolveWineId(tx, userId, wine)
        await assertOwnedSameBottle(tx, userId, fields.sameBottleOfId ?? null)
        const tagIds = await resolveAromaTagIds(tx, userId, aromaTagIds, newAromaTags)
        const weekId = await upsertWeek(tx, userId, week)

        const created = await tx.tastingEntry.create({
          data: {
            userId,
            wineId,
            weekId,
            ...toEntryData(fields),
            // Обязательные поля перечислены после спреда: при создании они всегда есть,
            // тогда как `toEntryData` описывает частичный патч и делает их необязательными.
            tastedOn: toDbDate(fields.tastedOn),
            volumeMl: fields.volumeMl,
            rating: fields.rating,
            aromas: { create: tagIds.map((tagId) => ({ tagId })) },
          },
          include: entryInclude,
        })

        await touchStore(tx, userId, fields.storeId ?? null)

        return toEntryRecord(created)
      })
    },

    async updateEntry({ userId, entryId, week, wine, fields, aromaTagIds, newAromaTags }) {
      return db.$transaction(async (tx) => {
        const existing = await tx.tastingEntry.findFirst({
          where: { id: entryId, userId, deletedAt: null },
          select: { id: true, weekId: true },
        })
        if (!existing) return null

        const wineId = wine ? await resolveWineId(tx, userId, wine) : undefined
        if (fields.sameBottleOfId !== undefined) {
          await assertOwnedSameBottle(tx, userId, fields.sameBottleOfId)
        }
        const weekId = week ? await upsertWeek(tx, userId, week) : undefined

        if (aromaTagIds !== null) {
          const tagIds = await resolveAromaTagIds(tx, userId, aromaTagIds, newAromaTags)
          await tx.entryAroma.deleteMany({ where: { entryId } })
          if (tagIds.length > 0) {
            await tx.entryAroma.createMany({
              data: tagIds.map((tagId) => ({ entryId, tagId })),
            })
          }
        }

        const updated = await tx.tastingEntry.update({
          where: { id: entryId },
          data: {
            ...(wineId === undefined ? {} : { wineId }),
            ...(weekId === undefined ? {} : { weekId }),
            ...toEntryData(fields),
          },
          include: entryInclude,
        })

        await touchStore(tx, userId, fields.storeId ?? null)
        if (weekId !== undefined && weekId !== existing.weekId) {
          await dropEmptyWeek(tx, userId, existing.weekId)
        }

        return toEntryRecord(updated)
      })
    },

    async softDeleteEntry({ userId, entryId, now }) {
      const result = await db.tastingEntry.updateMany({
        where: { id: entryId, userId, deletedAt: null },
        data: { deletedAt: now },
      })
      if (result.count === 0) return null

      const entry = await db.tastingEntry.findFirst({
        where: { id: entryId, userId },
        include: entryInclude,
      })

      return entry ? toEntryRecord(entry) : null
    },

    async restoreEntry({ userId, entryId }) {
      const restored = await db.tastingEntry.updateMany({
        where: { id: entryId, userId, deletedAt: { not: null } },
        data: { deletedAt: null },
      })
      if (restored.count === 0) return null

      const entry = await db.tastingEntry.findFirst({
        where: { id: entryId, userId },
        include: entryInclude,
      })

      return entry ? toEntryRecord(entry) : null
    },

    async purgeEntry({ userId, entryId }) {
      return db.$transaction(async (tx) => {
        const entry = await tx.tastingEntry.findFirst({
          where: { id: entryId, userId, deletedAt: { not: null } },
          select: { id: true, weekId: true, photos: true },
        })
        if (!entry) return null

        await tx.tastingEntry.delete({ where: { id: entryId } })
        await dropEmptyWeek(tx, userId, entry.weekId)

        return entry.photos.map(toPhotoRecord)
      })
    },

    async listAllEntries({ userId, from }) {
      const entries = await db.tastingEntry.findMany({
        where: {
          userId,
          deletedAt: null,
          ...(from === undefined ? {} : { tastedOn: { gte: toDbDate(from) } }),
        },
        include: entryInclude,
        // Хронология: и выгрузку, и динамику по неделям читают как дневник, а не как
        // список последних событий.
        orderBy: [{ tastedOn: 'asc' }, { createdAt: 'asc' }],
      })

      return entries.map(toEntryRecord)
    },

    async listTrash({ userId }) {
      const entries = await db.tastingEntry.findMany({
        where: { userId, deletedAt: { not: null } },
        include: entryInclude,
        orderBy: { deletedAt: 'desc' },
      })

      return entries.map((entry) => ({
        ...toEntryRecord(entry),
        deletedAt: entry.deletedAt as Date,
      }))
    },

    async purgeTrash({ userId, deletedBefore }) {
      return db.$transaction(async (tx) => {
        const entries = await tx.tastingEntry.findMany({
          where: {
            userId,
            deletedAt: deletedBefore ? { not: null, lt: deletedBefore } : { not: null },
          },
          select: { id: true, weekId: true, photos: true },
        })
        if (entries.length === 0) return { purgedEntries: 0, photos: [] }

        await tx.tastingEntry.deleteMany({
          where: { id: { in: entries.map((entry) => entry.id) } },
        })

        for (const weekId of new Set(entries.map((entry) => entry.weekId))) {
          await dropEmptyWeek(tx, userId, weekId)
        }

        return {
          purgedEntries: entries.length,
          photos: entries.flatMap((entry) => entry.photos.map(toPhotoRecord)),
        }
      })
    },

    async findWine({ userId, wineId }) {
      const wine = await db.wine.findFirst({ where: { id: wineId, userId, deletedAt: null } })
      return wine ? toWineRecord(wine) : null
    },

    async listWines({ userId, filters }) {
      // Личный справочник вин — это десятки-сотни строк на пользователя, поэтому агрегаты
      // (средний рейтинг, число дегустаций, дата последней) считаются в приложении.
      // Переносить это в SQL стоит только когда у кого-то реально вырастет справочник.
      const wines = await db.wine.findMany({
        where: {
          userId,
          deletedAt: null,
          ...(filters.type ? { type: filters.type } : {}),
          ...(filters.search
            ? { name: { contains: filters.search, mode: 'insensitive' as const } }
            : {}),
        },
        include: {
          entries: {
            where: { deletedAt: null },
            select: { rating: true, tastedOn: true },
          },
        },
      })

      const rows: WineListRow[] = wines.map((wine) => {
        const ratings = wine.entries.map((entry) => toRequiredNumber(entry.rating))
        const lastTastedOn = wine.entries.reduce<CalendarDate | null>((latest, entry) => {
          const date = toCalendarDate(entry.tastedOn)
          return latest === null || date > latest ? date : latest
        }, null)

        return {
          ...toWineRecord(wine),
          tastingCount: wine.entries.length,
          averageRating: averageWineRating(ratings),
          lastTastedOn,
          thumbKey: null,
        }
      })

      return paginateWines(rows, filters)
    },

    async listWineEntries({ userId, wineId }) {
      const entries = await db.tastingEntry.findMany({
        where: { userId, wineId, deletedAt: null },
        include: entryInclude,
        orderBy: { tastedOn: 'desc' },
      })

      return entries.map(toEntryRecord)
    },

    async deleteWine({ userId, wineId }) {
      return db.$transaction(async (tx) => {
        const wine = await tx.wine.findFirst({
          where: { id: wineId, userId, deletedAt: null },
          select: { id: true, _count: { select: { entries: { where: { deletedAt: null } } } } },
        })
        if (!wine) return 'missing' as const
        if (wine._count.entries > 0) return 'in_use' as const

        await tx.wine.update({ where: { id: wineId }, data: { deletedAt: new Date() } })
        return 'deleted' as const
      })
    },

    async listAromaTags({ userId }) {
      const tags = await db.aromaTag.findMany({
        where: { OR: [{ userId: null }, { userId }] },
        orderBy: [{ userId: 'asc' }, { nameRu: 'asc' }],
      })

      return tags.map(toAromaTagRecord)
    },

    async createAromaTag({ userId, name }) {
      const tag = await db.aromaTag.upsert({
        where: { userId_nameRu: { userId, nameRu: name } },
        create: { userId, nameRu: name },
        update: {},
      })

      return toAromaTagRecord(tag)
    },
  }
}

/**
 * Системные теги аромата доступны всем пользователям (ТЗ §5.3).
 *
 * Идемпотентно: `@@unique([userId, nameRu])` в PostgreSQL не ловит дубли системных тегов,
 * потому что NULL-владельцы считаются разными значениями — поэтому проверяем явно.
 * Запускается задачей `diary:aroma-tags:seed`, а не при каждом старте API.
 */
export async function seedSystemAromaTags(db: DbClient): Promise<number> {
  let created = 0

  for (const tag of systemAromaTags) {
    const existing = await db.aromaTag.findFirst({ where: { userId: null, nameRu: tag.ru } })
    if (existing) continue
    await db.aromaTag.create({ data: { userId: null, nameRu: tag.ru, nameEn: tag.en } })
    created += 1
  }

  return created
}

type TransactionClient = Parameters<Parameters<DbClient['$transaction']>[0]>[0]

async function resolveWineId(
  tx: TransactionClient,
  userId: string,
  selection: WineSelection,
): Promise<string> {
  if (selection.mode === 'existing') {
    const wine = await tx.wine.findFirst({
      where: { id: selection.wineId, userId, deletedAt: null },
      select: { id: true },
    })
    if (!wine) throw new DiaryFailure('not_found', 'Wine not found')
    return wine.id
  }

  const created = await tx.wine.create({
    data: {
      userId,
      name: selection.wine.name,
      type: selection.wine.type,
      producer: selection.wine.producer,
      originCountry: selection.wine.originCountry,
      region: selection.wine.region,
      grapes: selection.wine.grapes,
      vintage: selection.wine.vintage,
      abv: selection.wine.abv,
      sugar: selection.wine.sugar,
    },
    select: { id: true },
  })

  return created.id
}

async function assertOwnedSameBottle(
  tx: TransactionClient,
  userId: string,
  sameBottleOfId: string | null,
) {
  if (!sameBottleOfId) return

  const source = await tx.tastingEntry.findFirst({
    where: { id: sameBottleOfId, userId, deletedAt: null },
    select: { id: true },
  })
  if (!source) throw new DiaryFailure('not_found', 'Referenced tasting entry not found')
}

async function resolveAromaTagIds(
  tx: TransactionClient,
  userId: string,
  aromaTagIds: string[],
  newAromaTags: string[],
): Promise<string[]> {
  const ids = new Set<string>()

  if (aromaTagIds.length > 0) {
    const visible = await tx.aromaTag.findMany({
      where: { id: { in: aromaTagIds }, OR: [{ userId: null }, { userId }] },
      select: { id: true },
    })
    if (visible.length !== new Set(aromaTagIds).size) {
      throw new DiaryFailure('not_found', 'Aroma tag not found')
    }
    for (const tag of visible) ids.add(tag.id)
  }

  for (const name of newAromaTags) {
    const tag = await tx.aromaTag.upsert({
      where: { userId_nameRu: { userId, nameRu: name } },
      create: { userId, nameRu: name },
      update: {},
      select: { id: true },
    })
    ids.add(tag.id)
  }

  return [...ids]
}

/** Неделя создаётся автоматически при первой записи в ней — кнопки «создать неделю» нет (ТЗ §6). */
async function upsertWeek(
  tx: TransactionClient,
  userId: string,
  week: WeekTarget,
): Promise<string> {
  const created = await tx.week.upsert({
    where: { userId_startDate: { userId, startDate: toDbDate(week.startDate) } },
    create: {
      userId,
      startDate: toDbDate(week.startDate),
      endDate: toDbDate(week.endDate),
      isoYear: week.isoYear,
      isoWeek: week.isoWeek,
    },
    update: {},
    select: { id: true },
  })

  return created.id
}

/** Недель без записей в БД не держим, чтобы листание не спотыкалось о мусорные строки (ТЗ §6). */
async function dropEmptyWeek(tx: TransactionClient, userId: string, weekId: string) {
  const remaining = await tx.tastingEntry.count({ where: { weekId } })
  if (remaining > 0) return
  await tx.week.deleteMany({ where: { id: weekId, userId } })
}

async function touchStore(tx: TransactionClient, userId: string, storeId: string | null) {
  if (!storeId) return

  await tx.store.update({
    where: { id: storeId },
    data: { usageCount: { increment: 1 } },
  })
  await tx.userStoreRecent.upsert({
    where: { userId_storeId: { userId, storeId } },
    create: { userId, storeId },
    update: { useCount: { increment: 1 }, lastUsed: new Date() },
  })
}

function paginateWines(rows: WineListRow[], filters: WineListFilters): WineListRow[] {
  const filtered = rows.filter((row) => {
    if (filters.ratingMin !== undefined) {
      if (row.averageRating === null || row.averageRating < filters.ratingMin) return false
    }
    if (filters.ratingMax !== undefined) {
      if (row.averageRating === null || row.averageRating > filters.ratingMax) return false
    }
    return true
  })

  const direction = filters.order === 'asc' ? 1 : -1
  filtered.sort((left, right) => {
    const compared = compareWines(left, right, filters.sort)
    return compared === 0 ? left.id.localeCompare(right.id) : compared * direction
  })

  const start = filters.cursor
    ? filtered.findIndex((row) => row.id === filters.cursor) + 1
    : 0

  return filtered.slice(start, start + filters.limit)
}

function compareWines(left: WineListRow, right: WineListRow, sort: WineListFilters['sort']) {
  if (sort === 'name') return left.name.localeCompare(right.name)
  if (sort === 'rating') return (left.averageRating ?? -1) - (right.averageRating ?? -1)
  return (left.lastTastedOn ?? '').localeCompare(right.lastTastedOn ?? '')
}

function toEntryData(fields: Partial<EntryFields>) {
  return {
    ...(fields.tastedOn === undefined ? {} : { tastedOn: toDbDate(fields.tastedOn) }),
    ...(fields.volumeMl === undefined ? {} : { volumeMl: fields.volumeMl }),
    ...(fields.rating === undefined ? {} : { rating: fields.rating }),
    ...(fields.price === undefined ? {} : { price: fields.price }),
    ...(fields.currency === undefined ? {} : { currency: fields.currency }),
    ...(fields.purchaseCountry === undefined ? {} : { purchaseCountry: fields.purchaseCountry }),
    ...(fields.storeId === undefined ? {} : { storeId: fields.storeId }),
    ...(fields.body === undefined ? {} : { body: fields.body }),
    ...(fields.acidity === undefined ? {} : { acidity: fields.acidity }),
    ...(fields.tannins === undefined ? {} : { tannins: fields.tannins }),
    ...(fields.tasteCategory === undefined ? {} : { tasteCategory: fields.tasteCategory }),
    ...(fields.aftertaste === undefined ? {} : { aftertaste: fields.aftertaste }),
    ...(fields.notes === undefined ? {} : { notes: fields.notes }),
    ...(fields.sameBottleOfId === undefined ? {} : { sameBottleOfId: fields.sameBottleOfId }),
  }
}

type PrismaEntry = {
  id: string
  weekId: string
  tastedOn: Date
  volumeMl: number
  rating: unknown
  price: unknown
  currency: EntryRecord['currency']
  purchaseCountry: string | null
  body: EntryRecord['body']
  acidity: EntryRecord['acidity']
  tannins: EntryRecord['tannins']
  tasteCategory: EntryRecord['tasteCategory']
  aftertaste: EntryRecord['aftertaste']
  notes: string | null
  sameBottleOfId: string | null
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
  wine: Parameters<typeof toWineRecord>[0]
  store: Parameters<typeof toStoreRecord>[0] | null
  aromas: Array<{ tag: Parameters<typeof toAromaTagRecord>[0] }>
  photos: Array<Parameters<typeof toPhotoRecord>[0]>
}

function toEntryRecord(entry: PrismaEntry): EntryRecord {
  return {
    id: entry.id,
    weekId: entry.weekId,
    wine: toWineRecord(entry.wine),
    tastedOn: toCalendarDate(entry.tastedOn),
    volumeMl: entry.volumeMl,
    rating: toRequiredNumber(entry.rating),
    price: toNumber(entry.price),
    currency: entry.currency,
    purchaseCountry: entry.purchaseCountry,
    store: entry.store ? toStoreRecord(entry.store) : null,
    body: entry.body,
    acidity: entry.acidity,
    tannins: entry.tannins,
    tasteCategory: entry.tasteCategory,
    aftertaste: entry.aftertaste,
    notes: entry.notes,
    aromas: entry.aromas.map((link) => toAromaTagRecord(link.tag)),
    photos: entry.photos.map(toPhotoRecord),
    sameBottleOfId: entry.sameBottleOfId,
    deletedAt: entry.deletedAt,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  }
}

function toWineRecord(wine: {
  id: string
  name: string
  type: WineRecord['type']
  producer: string | null
  originCountry: string | null
  region: string | null
  grapes: string[]
  vintage: number | null
  abv: unknown
  sugar: WineRecord['sugar']
  createdAt: Date
}): WineRecord {
  return {
    id: wine.id,
    name: wine.name,
    type: wine.type,
    producer: wine.producer,
    originCountry: wine.originCountry?.trim() ?? null,
    region: wine.region,
    grapes: wine.grapes,
    vintage: wine.vintage,
    abv: toNumber(wine.abv),
    sugar: wine.sugar,
    createdAt: wine.createdAt,
  }
}

function toStoreRecord(store: {
  id: string
  name: string
  countryCode: string
  city: string | null
  kind: StoreRecord['kind']
  usageCount: number
}): StoreRecord {
  return {
    id: store.id,
    name: store.name,
    countryCode: store.countryCode.trim(),
    city: store.city,
    kind: store.kind,
    usageCount: store.usageCount,
  }
}

function toAromaTagRecord(tag: {
  id: string
  userId: string | null
  nameRu: string
  nameEn: string | null
}): AromaTagRecord {
  return {
    id: tag.id,
    nameRu: tag.nameRu,
    nameEn: tag.nameEn,
    isSystem: tag.userId === null,
  }
}

function toPhotoRecord(photo: {
  id: string
  kind: PhotoRecord['kind']
  storageKey: string
  thumbKey: string
  width: number
  height: number
}): PhotoRecord {
  return {
    id: photo.id,
    kind: photo.kind,
    storageKey: photo.storageKey,
    thumbKey: photo.thumbKey,
    width: photo.width,
    height: photo.height,
  }
}

/** `@db.Date` приходит из Prisma как полуночный UTC-Date — режем до календарной даты. */
function toCalendarDate(value: Date): CalendarDate {
  return value.toISOString().slice(0, 10)
}

function toDbDate(value: CalendarDate): Date {
  return new Date(`${value}T00:00:00.000Z`)
}

/** Prisma отдаёт Decimal-объекты; в DTO уезжают обычные числа. */
function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  return Number(value)
}

/** Для колонок NOT NULL — рейтинга и объёма, где null невозможен по схеме. */
function toRequiredNumber(value: unknown): number {
  return Number(value)
}

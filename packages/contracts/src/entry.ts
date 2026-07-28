import { z } from 'zod'

import { countryCodeSchema, isoDateSchema, uuidSchema } from './common'
import {
  aciditySchema,
  aftertasteSchema,
  bodySchema,
  currencySchema,
  photoKindSchema,
  tanninsSchema,
  tasteCategorySchema,
  wineTypeSchema,
} from './vocabulary'
import { wineInputSchema, wineSchema } from './wine'

/** ТЗ §7.3: шкала 0.5–5.0 с шагом 0.5, ноль невозможен. */
export const ratingSchema = z
  .number()
  .min(0.5, 'Rating starts at 0.5')
  .max(5, 'Rating tops out at 5.0')
  .refine((value) => Number.isInteger(value * 2), 'Rating must use 0.5 steps')

/** ТЗ §7.2: объём хранится в миллилитрах, быстрые кнопки — просто пресеты поверх этого поля. */
export const volumeMlSchema = z
  .number()
  .int('Volume must be a whole number of millilitres')
  .min(1)
  .max(5000)

export const priceSchema = z
  .number()
  .nonnegative()
  .max(1_000_000)
  .refine((value) => Number.isInteger(Math.round(value * 100)), 'Price allows at most 2 decimals')

/** Вино записи: либо повтор из личного справочника, либо новая карточка (ТЗ §7.5). */
export const entryWineSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('existing'), wineId: uuidSchema }),
  z.object({ mode: z.literal('new'), wine: wineInputSchema }),
])

/** Магазин: выбор существующего или создание нового в общем справочнике (ТЗ §5.2). */
export const entryStoreSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('existing'), storeId: uuidSchema }),
  z.object({
    mode: z.literal('new'),
    name: z.string().trim().min(2, 'Store name is too short').max(120),
    countryCode: countryCodeSchema,
    city: z.string().trim().max(120).optional(),
    kind: z.enum(['SUPERMARKET', 'WINE_SHOP', 'RESTAURANT', 'BAR', 'ONLINE', 'OTHER']).optional(),
  }),
])

const entryFieldsSchema = z.object({
  tastedOn: isoDateSchema,
  volumeMl: volumeMlSchema,
  rating: ratingSchema,
  price: priceSchema.optional(),
  currency: currencySchema.optional(),
  purchaseCountry: countryCodeSchema.optional(),
  store: entryStoreSchema.optional(),
  body: bodySchema.optional(),
  acidity: aciditySchema.optional(),
  tannins: tanninsSchema.optional(),
  tasteCategory: tasteCategorySchema.optional(),
  aftertaste: aftertasteSchema.optional(),
  notes: z.string().trim().max(4000).optional(),
  aromaTagIds: z.array(uuidSchema).max(30).optional().default([]),
  /** Свои теги аромата создаются на лету и остаются личными (ТЗ §5.3). */
  newAromaTags: z.array(z.string().trim().min(1).max(40)).max(10).optional().default([]),
  /** ТЗ §7.4: та же бутылка — цена не задваивается в тратах. */
  sameBottleOfId: uuidSchema.optional(),
})

/** ТЗ §7.1: если указана цена — валюта обязательна. */
const requireCurrencyWithPrice = <T extends { price?: number; currency?: unknown }>(
  value: T,
  ctx: z.RefinementCtx,
) => {
  if (value.price !== undefined && value.currency === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['currency'],
      message: 'Currency is required when a price is set',
    })
  }
}

export const entryCreateSchema = entryFieldsSchema
  .extend({ wine: entryWineSchema })
  .superRefine(requireCurrencyWithPrice)

export const entryUpdateSchema = entryFieldsSchema
  .extend({ wine: entryWineSchema.optional() })
  .partial()
  .superRefine(requireCurrencyWithPrice)

export const entryPhotoSchema = z.object({
  id: uuidSchema,
  kind: photoKindSchema,
  width: z.number().int(),
  height: z.number().int(),
  /** Подписанные URL с коротким TTL (ТЗ §11); клиент не должен их кэшировать надолго. */
  url: z.string(),
  thumbUrl: z.string(),
  expiresAt: z.string().datetime(),
})

export const entryPhotoResponseSchema = z.object({ photo: entryPhotoSchema })

/** До 2 фото на запись: бутылка и этикетка (ТЗ §11). */
export const photoUploadQuerySchema = z.object({
  kind: photoKindSchema,
})

export const entryAromaSchema = z.object({
  id: uuidSchema,
  nameRu: z.string(),
  nameEn: z.string().nullable(),
  isSystem: z.boolean(),
})

export const entryStoreRefSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  countryCode: z.string(),
  city: z.string().nullable(),
})

export const entrySchema = z.object({
  id: uuidSchema,
  wine: wineSchema,
  weekId: uuidSchema,
  tastedOn: isoDateSchema,
  volumeMl: z.number().int(),
  glasses: z.number(),
  rating: z.number(),
  price: z.number().nullable(),
  currency: currencySchema.nullable(),
  purchaseCountry: z.string().nullable(),
  store: entryStoreRefSchema.nullable(),
  body: bodySchema.nullable(),
  acidity: aciditySchema.nullable(),
  tannins: tanninsSchema.nullable(),
  tasteCategory: tasteCategorySchema.nullable(),
  aftertaste: aftertasteSchema.nullable(),
  notes: z.string().nullable(),
  aromas: z.array(entryAromaSchema),
  photos: z.array(entryPhotoSchema),
  sameBottleOfId: uuidSchema.nullable(),
  deletedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

/** Компактная строка для таблицы недели и списка дегустаций вина. */
export const entryListItemSchema = z.object({
  id: uuidSchema,
  wineId: uuidSchema,
  wineName: z.string(),
  wineType: wineTypeSchema,
  tastedOn: isoDateSchema,
  volumeMl: z.number().int(),
  glasses: z.number(),
  rating: z.number(),
  price: z.number().nullable(),
  currency: currencySchema.nullable(),
  tasteCategory: tasteCategorySchema.nullable(),
  isSameBottleRepeat: z.boolean(),
  thumbUrl: z.string().nullable(),
})

export const entryResponseSchema = z.object({ entry: entrySchema })

/**
 * Удаляющие эндпоинты отвечают телом, а не 204: клиенту нужна сама запись, чтобы показать
 * «Отменить» сразу после отправки в корзину, не перезапрашивая неделю.
 */
export const deletedResourceSchema = z.object({ id: uuidSchema })

export const trashPurgeResponseSchema = z.object({
  purgedEntries: z.number().int().nonnegative(),
})

/** Выгрузка дневника (ТЗ §14): CSV читает человек, JSON — программа. */
export const exportQuerySchema = z.object({
  format: z.enum(['csv', 'json']).optional().default('csv'),
})

export const trashListResponseSchema = z.object({
  items: z.array(
    entryListItemSchema.extend({
      deletedAt: z.string().datetime(),
    }),
  ),
})

export type EntryCreateRequest = z.input<typeof entryCreateSchema>
export type EntryCreatePayload = z.output<typeof entryCreateSchema>
export type EntryUpdateRequest = z.input<typeof entryUpdateSchema>
export type EntryUpdatePayload = z.output<typeof entryUpdateSchema>
export type EntryDto = z.infer<typeof entrySchema>
export type EntryListItemDto = z.infer<typeof entryListItemSchema>
export type EntryPhotoDto = z.infer<typeof entryPhotoSchema>
export type PhotoUploadQuery = z.output<typeof photoUploadQuerySchema>
export type EntryAromaDto = z.infer<typeof entryAromaSchema>
export type EntryStoreRef = z.infer<typeof entryStoreRefSchema>
export type TrashListResponse = z.infer<typeof trashListResponseSchema>
export type DeletedResource = z.infer<typeof deletedResourceSchema>
export type TrashPurgeResponse = z.infer<typeof trashPurgeResponseSchema>
export type ExportQuery = z.output<typeof exportQuerySchema>
export type ExportFormat = ExportQuery['format']

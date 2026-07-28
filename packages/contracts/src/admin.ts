import { z } from 'zod'

import { uuidSchema } from './common'
import { storeKindSchema } from './vocabulary'

/**
 * Админка справочника магазинов (ТЗ §5.2 п.3, §10.12).
 *
 * Администратор не видит дневников: его инструменты — только общий справочник, где он
 * склеивает дубли и прячет мусор. Никаких пользовательских сущностей в этих схемах нет
 * намеренно.
 */

export const storeStatusSchema = z.enum(['ACTIVE', 'HIDDEN', 'MERGED'])

export const adminStoreSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  countryCode: z.string(),
  city: z.string().nullable(),
  kind: storeKindSchema,
  status: storeStatusSchema,
  /** Куда слит дубль. null у всех, кроме `MERGED`. */
  mergedIntoId: uuidSchema.nullable(),
  usageCount: z.number().int().nonnegative(),
  /** Сколько записей ссылается на магазин сейчас: по нему видно, что реально в ходу. */
  entryCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
})

export const adminStoreListQuerySchema = z.object({
  status: storeStatusSchema.optional(),
  search: z.string().trim().max(120).optional(),
  country: z.string().trim().length(2).toUpperCase().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
})

export const adminStoreListResponseSchema = z.object({
  items: z.array(adminStoreSchema),
})

export const adminStoreMergeSchema = z.object({
  /** Магазин-мастер, на который перецепляются все записи дубля. */
  targetId: uuidSchema,
})

export const adminStoreStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'HIDDEN']),
})

export type StoreStatus = z.infer<typeof storeStatusSchema>
export type AdminStoreDto = z.infer<typeof adminStoreSchema>
export type AdminStoreListQuery = z.output<typeof adminStoreListQuerySchema>
export type AdminStoreListResponse = z.infer<typeof adminStoreListResponseSchema>
export type AdminStoreMergePayload = z.output<typeof adminStoreMergeSchema>
export type AdminStoreStatusPayload = z.output<typeof adminStoreStatusSchema>

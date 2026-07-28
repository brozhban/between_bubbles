import { z } from 'zod'

import { countryCodeSchema, uuidSchema } from './common'
import { storeKindSchema } from './vocabulary'

export const storeSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  countryCode: z.string(),
  city: z.string().nullable(),
  kind: storeKindSchema,
  usageCount: z.number().int().nonnegative(),
})

export const storeSearchQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  /** Страна покупки из формы: подсказки сначала по ней (ТЗ §5.2, слой 2). */
  country: countryCodeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(20).optional().default(10),
})

export const storeSearchResponseSchema = z.object({
  /** Личные недавние магазины пользователя — первыми в выдаче. */
  recent: z.array(storeSchema),
  matches: z.array(storeSchema),
  /**
   * Кандидат на дубль при сходстве ≥ 0.6 (ТЗ §5.2, слой 1).
   * Клиент показывает «Возможно, вы имели в виду…» перед созданием нового магазина.
   */
  duplicateSuggestion: storeSchema.extend({ similarity: z.number().min(0).max(1) }).nullable(),
})

export const storeCreateSchema = z.object({
  name: z.string().trim().min(2, 'Store name is too short').max(120),
  countryCode: countryCodeSchema,
  city: z.string().trim().max(120).optional(),
  kind: storeKindSchema.optional().default('OTHER'),
})

export type StoreDto = z.infer<typeof storeSchema>
export type StoreSearchQuery = z.output<typeof storeSearchQuerySchema>
export type StoreSearchResponse = z.infer<typeof storeSearchResponseSchema>
export type StoreCreatePayload = z.output<typeof storeCreateSchema>

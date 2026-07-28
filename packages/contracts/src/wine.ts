import { z } from 'zod'

import { countryCodeSchema, isoDateSchema, uuidSchema } from './common'
import { sugarLevelSchema, wineTypeSchema } from './vocabulary'

/** Год урожая. Верхняя граница — следующий календарный год: южное полушарие разливает раньше. */
const vintageSchema = z
  .number()
  .int()
  .min(1900)
  .max(new Date().getUTCFullYear() + 1)

const optionalText = (max: number) =>
  z
    .union([z.string().trim().max(max), z.literal('')])
    .optional()
    .transform((value) => (value === '' || value === undefined ? undefined : value))

export const wineInputSchema = z.object({
  name: z.string().trim().min(1, 'Wine name is required').max(200),
  type: wineTypeSchema,
  producer: optionalText(200),
  originCountry: countryCodeSchema.optional(),
  region: optionalText(200),
  grapes: z.array(z.string().trim().min(1).max(80)).max(12).optional().default([]),
  vintage: vintageSchema.optional(),
  abv: z.number().min(0).max(99.9).optional(),
  sugar: sugarLevelSchema.optional(),
})

export const wineUpdateSchema = wineInputSchema.partial()

export const wineSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  type: wineTypeSchema,
  producer: z.string().nullable(),
  originCountry: z.string().nullable(),
  region: z.string().nullable(),
  grapes: z.array(z.string()),
  vintage: z.number().int().nullable(),
  abv: z.number().nullable(),
  sugar: sugarLevelSchema.nullable(),
  createdAt: z.string().datetime(),
})

/** Строка списка «Мои вина» (ТЗ §10.8). Средний рейтинг считается только внутри одного вина. */
export const wineListItemSchema = wineSchema.extend({
  tastingCount: z.number().int().nonnegative(),
  averageRating: z.number().nullable(),
  lastTastedOn: isoDateSchema.nullable(),
  thumbUrl: z.string().nullable(),
})

export const wineListQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  type: wineTypeSchema.optional(),
  ratingMin: z.coerce.number().min(0.5).max(5).optional(),
  ratingMax: z.coerce.number().min(0.5).max(5).optional(),
  sort: z.enum(['lastTasted', 'rating', 'name']).optional().default('lastTasted'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  cursor: uuidSchema.optional(),
})

export const wineListResponseSchema = z.object({
  items: z.array(wineListItemSchema),
  nextCursor: uuidSchema.nullable(),
})

export type WineInput = z.input<typeof wineInputSchema>
export type WinePayload = z.output<typeof wineInputSchema>
export type WineUpdatePayload = z.output<typeof wineUpdateSchema>
export type WineDto = z.infer<typeof wineSchema>
export type WineListItemDto = z.infer<typeof wineListItemSchema>
export type WineListQuery = z.output<typeof wineListQuerySchema>
export type WineListResponse = z.infer<typeof wineListResponseSchema>

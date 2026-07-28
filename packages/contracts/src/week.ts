import { z } from 'zod'

import { isoDateSchema, uuidSchema } from './common'
import { entryListItemSchema } from './entry'
import { currencySchema, tasteCategorySchema, wineTypeSchema } from './vocabulary'

export const weekQuerySchema = z.object({
  /** Любая дата внутри недели. Опущено — текущая неделя в таймзоне пользователя. */
  date: isoDateSchema.optional(),
})

export const topEntrySchema = z.object({
  entryId: uuidSchema,
  wineId: uuidSchema,
  wineName: z.string(),
  wineType: wineTypeSchema,
  rating: z.number(),
  tastedOn: isoDateSchema,
})

export const typeShareSchema = z.object({
  type: wineTypeSchema,
  count: z.number().int().nonnegative(),
  share: z.number().min(0).max(1),
})

export const categoryShareSchema = z.object({
  /** null — сегмент «Без категории» (ТЗ §8.1). */
  category: tasteCategorySchema.nullable(),
  count: z.number().int().nonnegative(),
  share: z.number().min(0).max(1),
})

export const currencyTotalSchema = z.object({
  currency: currencySchema,
  total: z.number(),
})

export const weekMetricsSchema = z.object({
  totalEntries: z.number().int().nonnegative(),
  totalGlasses: z.number(),
  totalMl: z.number().int().nonnegative(),
  /** Все лидеры по рейтингу, отсортированы по дате дегустации (ТЗ §8.1). */
  topEntries: z.array(topEntrySchema),
  /** Мода по категории вкуса; при ничьей — все лидеры. Пусто, если категорий нет ни у одной записи. */
  topTasteCategories: z.array(tasteCategorySchema),
  typeDistribution: z.array(typeShareSchema),
  categoryDistribution: z.array(categoryShareSchema),
  /** null, когда пользователь не включил «Показывать суммарные траты». */
  spendByCurrency: z.array(currencyTotalSchema).nullable(),
})

export const weekDaySchema = z.object({
  date: isoDateSchema,
  /** 1 = понедельник … 7 = воскресенье. */
  weekday: z.number().int().min(1).max(7),
  entryCount: z.number().int().nonnegative(),
  glasses: z.number(),
})

export const weekResponseSchema = z.object({
  /** null, пока в неделе нет ни одной записи — пустые недели в БД не создаются (ТЗ §6). */
  weekId: uuidSchema.nullable(),
  startDate: isoDateSchema,
  endDate: isoDateSchema,
  isoYear: z.number().int(),
  isoWeek: z.number().int(),
  isCurrent: z.boolean(),
  /** null для пустой недели: блок метрик и диаграммы скрываются целиком. */
  metrics: weekMetricsSchema.nullable(),
  days: z.array(weekDaySchema).length(7),
  entries: z.array(entryListItemSchema),
})

export type WeekQuery = z.output<typeof weekQuerySchema>
export type WeekMetricsDto = z.infer<typeof weekMetricsSchema>
export type WeekDayDto = z.infer<typeof weekDaySchema>
export type WeekResponse = z.infer<typeof weekResponseSchema>
export type TopEntryDto = z.infer<typeof topEntrySchema>
export type TypeShareDto = z.infer<typeof typeShareSchema>
export type CategoryShareDto = z.infer<typeof categoryShareSchema>
export type CurrencyTotalDto = z.infer<typeof currencyTotalSchema>

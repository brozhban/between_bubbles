import { z } from 'zod'

import { isoDateSchema, uuidSchema } from './common'
import { categoryShareSchema, currencyTotalSchema, typeShareSchema } from './week'
import { wineTypeSchema } from './vocabulary'

/**
 * Статистика за период (ТЗ §10.9).
 *
 * Границы календарные, а не «последние 30 дней»: дневник читают по месяцам и годам,
 * и «этот месяц» человек понимает без объяснений. Считаются они в таймзоне пользователя,
 * как и границы недель (ТЗ §6).
 */
export const statsPeriodSchema = z.enum(['month', 'year', 'all'])

export const statsQuerySchema = z.object({
  period: statsPeriodSchema.optional().default('month'),
})

/** Топ вин периода: рейтинг вина — это среднее по его дегустациям (ТЗ §8.2). */
export const topWineSchema = z.object({
  wineId: uuidSchema,
  name: z.string(),
  type: wineTypeSchema,
  averageRating: z.number(),
  tastingCount: z.number().int().positive(),
})

/** Доли по странам и сортам: сорт считается у каждой записи, где он указан. */
export const statsShareSchema = z.object({
  /** Код страны ISO 3166-1 alpha-2 либо название сорта — смотря какое распределение. */
  key: z.string(),
  count: z.number().int().nonnegative(),
  share: z.number().min(0).max(1),
})

export const statsWeekPointSchema = z.object({
  startDate: isoDateSchema,
  isoYear: z.number().int(),
  isoWeek: z.number().int(),
  entryCount: z.number().int().nonnegative(),
  glasses: z.number(),
})

export const statsResponseSchema = z.object({
  period: statsPeriodSchema,
  /** null у периода «всё время»: у него нет начала, пока нет первой записи. */
  startDate: isoDateSchema.nullable(),
  endDate: isoDateSchema,
  totalEntries: z.number().int().nonnegative(),
  totalGlasses: z.number(),
  totalMl: z.number().int().nonnegative(),
  topWines: z.array(topWineSchema),
  typeDistribution: z.array(typeShareSchema),
  categoryDistribution: z.array(categoryShareSchema),
  countryDistribution: z.array(statsShareSchema),
  grapeDistribution: z.array(statsShareSchema),
  /** Динамика по неделям: только недели с записями, от старых к новым. */
  weeks: z.array(statsWeekPointSchema),
  /** null, когда пользователь не включил «Показывать суммарные траты» (ТЗ §8.1). */
  spendByCurrency: z.array(currencyTotalSchema).nullable(),
})

export type StatsPeriod = z.infer<typeof statsPeriodSchema>
export type StatsQuery = z.output<typeof statsQuerySchema>
export type TopWineDto = z.infer<typeof topWineSchema>
export type StatsShareDto = z.infer<typeof statsShareSchema>
export type StatsWeekPointDto = z.infer<typeof statsWeekPointSchema>
export type StatsResponse = z.infer<typeof statsResponseSchema>

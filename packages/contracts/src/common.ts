import { z } from 'zod'

/** Календарная дата без времени, `YYYY-MM-DD`. Даты дегустаций и недель не имеют времени суток. */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD format')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`)
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
  }, 'Date does not exist')

export const uuidSchema = z.string().uuid()

/** ISO 3166-1 alpha-2. Валидируем форму, а не членство в списке: справочник живёт на клиенте. */
export const countryCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, 'Country must be an ISO 3166-1 alpha-2 code')

export const ianaTimezoneSchema = z.string().trim().min(1).max(64)

export const localeSchema = z.enum(['ru', 'en'])

export const themeSchema = z.enum(['light', 'dark', 'system'])

export type IsoDate = z.infer<typeof isoDateSchema>
export type Locale = z.infer<typeof localeSchema>
export type Theme = z.infer<typeof themeSchema>

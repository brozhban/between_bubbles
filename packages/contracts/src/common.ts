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

/**
 * Таймзона проверяется на пригодность, а не только на длину.
 *
 * Границы недель считаются через `Intl.DateTimeFormat` с этой зоной (ТЗ §6), и неизвестное
 * значение роняет неделю, статистику и создание записей в 500 — навсегда, до ручной правки
 * профиля, которую пользователь сделать уже не может: экран настроек тоже не открывается.
 * Проверку делает сама среда: список зон живёт в ICU и обновляется вместе с ним.
 */
export const ianaTimezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine(isUsableTimezone, 'Unknown IANA time zone')

function isUsableTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone })
    return true
  } catch {
    return false
  }
}

export const localeSchema = z.enum(['ru', 'en'])

export const themeSchema = z.enum(['light', 'dark', 'system'])

export type IsoDate = z.infer<typeof isoDateSchema>
export type Locale = z.infer<typeof localeSchema>
export type Theme = z.infer<typeof themeSchema>

import { z } from 'zod'

import { ianaTimezoneSchema, localeSchema, themeSchema, uuidSchema } from './common'
import { currencySchema } from './vocabulary'

/** ТЗ §10.11. Каждое поле опционально: экран настроек шлёт только изменившееся. */
export const profileUpdateSchema = z
  .object({
    displayName: z.union([z.string().trim().min(2).max(80), z.literal('')]).optional(),
    locale: localeSchema.optional(),
    theme: themeSchema.optional(),
    timezone: ianaTimezoneSchema.optional(),
    defaultCurrency: currencySchema.optional(),
    showSpendTotals: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Nothing to update')

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(8).max(128),
  newPassword: z.string().min(8).max(128),
})

export const accountDeleteSchema = z.object({
  password: z.string().min(8).max(128),
  /** Подтверждение намерения: удаление необратимо через 30 дней (ТЗ §14). */
  confirm: z.literal(true),
})

export const aromaTagSchema = z.object({
  id: uuidSchema,
  nameRu: z.string(),
  nameEn: z.string().nullable(),
  isSystem: z.boolean(),
})

export const aromaTagCreateSchema = z.object({
  name: z.string().trim().min(1).max(40),
})

export const aromaTagListResponseSchema = z.object({
  items: z.array(aromaTagSchema),
})

export type ProfileUpdatePayload = z.output<typeof profileUpdateSchema>
export type PasswordChangePayload = z.output<typeof passwordChangeSchema>
export type AccountDeletePayload = z.output<typeof accountDeleteSchema>
export type AromaTagDto = z.infer<typeof aromaTagSchema>
export type AromaTagListResponse = z.infer<typeof aromaTagListResponseSchema>

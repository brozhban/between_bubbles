import { z } from 'zod'

import { isAdultOn, todayInTimezone } from './age'
import { ianaTimezoneSchema, isoDateSchema, localeSchema, themeSchema } from './common'
import { isCompromisedPassword } from './password-strength'
import { currencySchema } from './vocabulary'

const displayNameSchema = z
  .union([z.string().trim().min(2).max(80), z.literal('')])
  .optional()
  .transform((value) => {
    if (value === '' || value === undefined) return undefined
    return value
  })

export const emailSchema = z.string().trim().toLowerCase().email().max(254)

/**
 * ТЗ §13: минимум 8 символов и проверка по спискам утечек. Правило живёт в контрактах,
 * поэтому одинаково работает и в браузере (сразу подсказывает), и на сервере (не доверяет).
 */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .refine(
    (password) => !isCompromisedPassword(password),
    'This password shows up in known leaks — pick a less common one',
  )

/**
 * Профиль пользователя. Настройки едут вместе с сессией, потому что webapp применяет
 * язык, тему и валюту по умолчанию сразу на первом рендере после /me.
 */
export const userSchema = z.object({
  id: z.string(),
  email: emailSchema,
  displayName: z.string().nullable(),
  locale: localeSchema,
  theme: themeSchema,
  timezone: z.string(),
  defaultCurrency: currencySchema,
  showSpendTotals: z.boolean(),
  avatarUrl: z.string().nullable(),
  /** Подтверждение почты ничего не блокирует (ТЗ §13): клиенту оно нужно только для напоминания. */
  emailVerified: z.boolean(),
  /** Роль администратора справочника магазинов (ТЗ §2). Дневников он не видит. */
  isAdmin: z.boolean(),
  createdAt: z.string().datetime(),
})

export const registerRequestSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    displayName: displayNameSchema,
    /** ТЗ §14: 18+, дата рождения обязательна при регистрации. */
    birthDate: isoDateSchema,
    /** Определяется из браузера; задаёт границы недель (ТЗ §6). */
    timezone: ianaTimezoneSchema.optional().default('Asia/Tbilisi'),
    locale: localeSchema.optional().default('ru'),
    /** Согласие с офертой и политикой фиксируется вместе с версией документа. */
    acceptedTermsVersion: z.string().trim().min(1).max(32),
  })
  .superRefine((value, ctx) => {
    if (!isAdultOn(value.birthDate, todayInTimezone(value.timezone ?? 'Asia/Tbilisi'))) {
      ctx.addIssue({
        code: 'custom',
        path: ['birthDate'],
        message: 'Registration is available from 18 years old',
      })
    }
  })

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
})

/**
 * Одноразовые ссылки из письма (ТЗ §13). Токен приходит из письма целиком, поэтому клиент
 * его не разбирает: длина проверяется только для отсева заведомого мусора.
 */
const oneTimeTokenSchema = z.string().trim().min(20).max(200)

export const passwordForgotSchema = z.object({ email: emailSchema })

export const passwordResetSchema = z.object({
  token: oneTimeTokenSchema,
  password: passwordSchema,
})

export const emailVerifySchema = z.object({ token: oneTimeTokenSchema })

export const cookieRefreshRequestSchema = z.object({}).strict().optional().default({})
export const cookieLogoutRequestSchema = z.object({}).strict().optional().default({})

export const tokenRefreshRequestSchema = z.object({
  refreshToken: z.string().min(32),
})

export const tokenLogoutRequestSchema = tokenRefreshRequestSchema

export const cookieAuthResponseSchema = z.object({
  user: userSchema,
  accessToken: z.string(),
}).strict()

export const tokenAuthResponseSchema = cookieAuthResponseSchema.extend({
  refreshToken: z.string(),
})

export const cookieRefreshResponseSchema = z.object({
  accessToken: z.string(),
}).strict()

export const tokenRefreshResponseSchema = cookieRefreshResponseSchema.extend({
  refreshToken: z.string(),
})

export const meResponseSchema = z.object({
  user: userSchema,
})

export type UserDto = z.infer<typeof userSchema>
export type RegisterRequest = z.input<typeof registerRequestSchema>
export type RegisterPayload = z.output<typeof registerRequestSchema>
export type LoginRequest = z.infer<typeof loginRequestSchema>
export type PasswordForgotRequest = z.infer<typeof passwordForgotSchema>
export type PasswordResetRequest = z.infer<typeof passwordResetSchema>
export type EmailVerifyRequest = z.infer<typeof emailVerifySchema>
export type CookieRefreshRequest = z.infer<typeof cookieRefreshRequestSchema>
export type CookieLogoutRequest = z.infer<typeof cookieLogoutRequestSchema>
export type TokenRefreshRequest = z.infer<typeof tokenRefreshRequestSchema>
export type TokenLogoutRequest = z.infer<typeof tokenLogoutRequestSchema>
export type CookieAuthResponse = z.infer<typeof cookieAuthResponseSchema>
export type TokenAuthResponse = z.infer<typeof tokenAuthResponseSchema>
export type CookieRefreshResponse = z.infer<typeof cookieRefreshResponseSchema>
export type TokenRefreshResponse = z.infer<typeof tokenRefreshResponseSchema>
export type MeResponse = z.infer<typeof meResponseSchema>

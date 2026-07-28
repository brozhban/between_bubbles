import type { Currency, Locale, Theme, UserDto } from '@between-bubbles/contracts'

export type AuthUserRecord = {
  id: string
  email: string
  passwordHash: string | null
  displayName: string | null
  avatarKey: string | null
  locale: string
  theme: string
  timezone: string
  defaultCurrency: Currency
  showSpendTotals: boolean
  emailVerifiedAt: Date | null
  createdAt: Date
}

export type AuthenticatedPrincipal = UserDto & {
  sessionId: string
}

const locales: readonly Locale[] = ['ru', 'en']
const themes: readonly Theme[] = ['light', 'dark', 'system']

/**
 * Базовое DTO. Роль администратора здесь всегда `false`: она задаётся списком почт в конфиге,
 * и подставляет её приложение, которое этот конфиг читает (см. `createApp`).
 */
export function toBaseUserDto(user: AuthUserRecord): UserDto {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    locale: locales.includes(user.locale as Locale) ? (user.locale as Locale) : 'ru',
    theme: themes.includes(user.theme as Theme) ? (user.theme as Theme) : 'system',
    timezone: user.timezone,
    defaultCurrency: user.defaultCurrency,
    showSpendTotals: user.showSpendTotals,
    // Аватар отдаётся подписанной ссылкой вместе с остальными фото — пока загрузки нет, null.
    avatarUrl: null,
    emailVerified: user.emailVerifiedAt !== null,
    isAdmin: false,
    createdAt: user.createdAt.toISOString(),
  }
}

export function userDtoFromPrincipal(principal: AuthenticatedPrincipal): UserDto {
  const { sessionId: _sessionId, ...user } = principal
  return user
}

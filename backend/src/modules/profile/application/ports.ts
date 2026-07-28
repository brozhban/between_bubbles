import type { Currency } from '@between-bubbles/contracts'

/**
 * Порт профиля.
 *
 * Профиль владеет только предпочтениями пользователя: язык, тема, таймзона, валюта и
 * тумблер трат. Пароли и сессии остаются за модулем `auth` — здесь их нет намеренно,
 * чтобы учётные данные имели ровно одного владельца.
 */
export type ProfileSettings = {
  displayName?: string | null
  locale?: string
  theme?: string
  timezone?: string
  defaultCurrency?: Currency
  showSpendTotals?: boolean
}

export type ProfileUserRecord = {
  id: string
  email: string
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

export type ProfileRepository = {
  updateSettings(input: {
    userId: string
    settings: ProfileSettings
  }): Promise<ProfileUserRecord | null>
}

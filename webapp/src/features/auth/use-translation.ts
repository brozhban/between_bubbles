import type { Locale } from '@between-bubbles/contracts'
import { useMemo } from 'react'

import { createTranslator, type Translate } from '@/platform/i18n'
import { useAuth } from './use-auth'

/**
 * Язык интерфейса приходит из профиля вместе с сессией, поэтому переводчик живёт рядом
 * с auth: другого места, где локаль уже известна всем экранам, просто нет.
 * До входа язык русский — сменить его можно только в настройках аккаунта.
 */
export function useTranslation(): { t: Translate; locale: Locale } {
  const { user } = useAuth()
  const locale: Locale = user?.locale ?? 'ru'

  return useMemo(() => ({ t: createTranslator(locale), locale }), [locale])
}

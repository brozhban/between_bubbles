import type { Locale } from '@between-bubbles/contracts'
import { useEffect, useMemo } from 'react'

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

  // `lang` в разметке зашит как `ru`, потому что документ отдаётся статикой до того, как
  // станет известен профиль. Держим его в согласии с интерфейсом: от этого зависят
  // произношение у скринридера, переносы и предложение перевести страницу.
  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  return useMemo(() => ({ t: createTranslator(locale), locale }), [locale])
}

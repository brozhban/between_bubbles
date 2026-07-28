import type { Theme } from '@between-bubbles/contracts'
import { useEffect } from 'react'

/**
 * Применяет тему пользователя к документу (ТЗ §13).
 *
 * «Системная» означает подписку на `prefers-color-scheme`: если человек переключит тему
 * в ОС при открытой вкладке, приложение должно поехать следом, а не ждать перезагрузки.
 */
export function useAppliedTheme(theme: Theme | undefined) {
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')

    const apply = () => {
      const isDark = theme === 'dark' || ((theme ?? 'system') === 'system' && media.matches)
      document.documentElement.classList.toggle('dark', isDark)
    }

    apply()
    if ((theme ?? 'system') !== 'system') return

    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])
}

import type { Locale } from '@between-bubbles/contracts'

/**
 * Короткие названия дней недели берём у среды выполнения, а не держим таблицу:
 * для ru и en `Intl` уже знает правильные сокращения, а Typography делает их капсом.
 * Индекс — 1 = понедельник … 7 = воскресенье, как в `WeekDayDto`.
 */
export function weekdayShortLabel(weekday: number, locale: Locale): string {
  // 2024-01-01 — понедельник, поэтому смещение от него даёт нужный день.
  const date = new Date(Date.UTC(2024, 0, weekday))
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'ru-RU', {
    weekday: 'short',
    timeZone: 'UTC',
  }).format(date)
}

import type { Locale } from '@between-bubbles/contracts'

/** Всегда одна десятичная: 4 и 4.0 в дневнике читаются как разные оценки. */
export function formatRating(value: number): string {
  return value.toFixed(1)
}

/**
 * Календарная дата `YYYY-MM-DD` под язык интерфейса.
 * Считаем в UTC: у даты дегустации нет времени суток, и сдвиг браузера её не должен двигать.
 */
export function formatDate(date: string, locale: Locale): string {
  return new Date(`${date}T00:00:00.000Z`).toLocaleDateString(locale === 'en' ? 'en-GB' : 'ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

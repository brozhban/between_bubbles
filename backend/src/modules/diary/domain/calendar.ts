/**
 * Календарь дневника: недели Пн–Вс и «сегодня» в таймзоне пользователя (ТЗ §6).
 *
 * Все функции работают с календарными датами `YYYY-MM-DD`. Таймзона нужна ровно в одном
 * месте — чтобы понять, какой сегодня день у пользователя; дальше арифметика уже без времени.
 */

export type CalendarDate = string

const MS_PER_DAY = 86_400_000

export type WeekBoundaries = {
  startDate: CalendarDate
  endDate: CalendarDate
  isoYear: number
  isoWeek: number
}

function toUtc(date: CalendarDate): Date {
  return new Date(`${date}T00:00:00.000Z`)
}

function toCalendarDate(date: Date): CalendarDate {
  return date.toISOString().slice(0, 10)
}

export function addDays(date: CalendarDate, days: number): CalendarDate {
  return toCalendarDate(new Date(toUtc(date).getTime() + days * MS_PER_DAY))
}

/** 1 = понедельник … 7 = воскресенье. */
export function weekday(date: CalendarDate): number {
  const jsDay = toUtc(date).getUTCDay()
  return jsDay === 0 ? 7 : jsDay
}

export function startOfWeek(date: CalendarDate): CalendarDate {
  return addDays(date, -(weekday(date) - 1))
}

export function weekBoundaries(date: CalendarDate): WeekBoundaries {
  const startDate = startOfWeek(date)
  const endDate = addDays(startDate, 6)

  // Четверг всегда лежит в том же ISO-году, что и вся неделя — на нём и считаем номер.
  const thursday = toUtc(addDays(startDate, 3))
  const isoYear = thursday.getUTCFullYear()
  const januaryFirst = Date.UTC(isoYear, 0, 1)
  const isoWeek = Math.floor((thursday.getTime() - januaryFirst) / MS_PER_DAY / 7) + 1

  return { startDate, endDate, isoYear, isoWeek }
}

export function weekDates(startDate: CalendarDate): CalendarDate[] {
  return Array.from({ length: 7 }, (_, index) => addDays(startDate, index))
}

/** Календарная «сегодня» в IANA-таймзоне пользователя. */
export function todayIn(timezone: string, now: Date = new Date()): CalendarDate {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/** ТЗ §6: дата дегустации в будущем запрещена; «будущее» — по таймзоне пользователя. */
export function isFutureDate(
  date: CalendarDate,
  timezone: string,
  now: Date = new Date(),
): boolean {
  return date > todayIn(timezone, now)
}

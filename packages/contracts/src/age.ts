/** ТЗ §14: регистрация только с 18 лет. Проверяется и на клиенте, и на сервере. */
export const MIN_AGE_YEARS = 18

/**
 * Возраст на конкретную дату по календарю, без часовых поясов и без учёта времени суток.
 * Обе даты — `YYYY-MM-DD`; сервер подставляет «сегодня» в таймзоне пользователя.
 */
export function ageOn(birthDate: string, referenceDate: string): number {
  const [birthYear, birthMonth, birthDay] = birthDate.split('-').map(Number)
  const [refYear, refMonth, refDay] = referenceDate.split('-').map(Number)

  let age = refYear - birthYear
  if (refMonth < birthMonth || (refMonth === birthMonth && refDay < birthDay)) {
    age -= 1
  }

  return age
}

export function isAdultOn(birthDate: string, referenceDate: string): boolean {
  return ageOn(birthDate, referenceDate) >= MIN_AGE_YEARS
}

/** Календарная «сегодня» в произвольной IANA-таймзоне, как `YYYY-MM-DD`. */
export function todayInTimezone(timezone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)

  return parts
}

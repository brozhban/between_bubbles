import { COUNTRY_CODES, FEATURED_COUNTRY_CODES, type Locale } from '@between-bubbles/contracts'

export type CountryOption = {
  code: string
  name: string
  flag: string
}

/** Флаг собирается из кода парой regional indicator symbols — картинки не нужны. */
export function countryFlag(code: string): string {
  return String.fromCodePoint(
    ...[...code.toUpperCase()].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65),
  )
}

/**
 * Полный справочник стран под язык интерфейса. Винодельческие страны идут первыми,
 * остальные — по алфавиту выбранной локали.
 */
export function countryOptions(locale: Locale): CountryOption[] {
  const display = new Intl.DisplayNames([locale], { type: 'region' })
  const named: CountryOption[] = COUNTRY_CODES.map((code) => ({
    code,
    name: display.of(code) ?? code,
    flag: countryFlag(code),
  }))

  const featured = FEATURED_COUNTRY_CODES.map((code) =>
    named.find((country) => country.code === code),
  ).filter((country): country is CountryOption => country !== undefined)

  const rest = named
    .filter((country) => !FEATURED_COUNTRY_CODES.includes(country.code))
    .sort((left, right) => left.name.localeCompare(right.name, locale))

  return [...featured, ...rest]
}

export function countryName(code: string, locale: Locale): string {
  return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code
}

import type { Locale } from '@between-bubbles/contracts'

/**
 * Адреса правовых страниц.
 *
 * Документы живут на `website`, а форма регистрации — на своём домене, поэтому
 * относительной ссылки не хватает: база приходит из сборки, как и адрес API.
 * Без этих ссылок галочка согласия отсылала бы к тексту, который негде прочитать (ТЗ §14).
 *
 * Язык выбирается по интерфейсу: согласие на английском, ведущее на русский документ,
 * означало бы согласие с текстом, которого человек не читал.
 *
 * До входа язык интерфейса всегда русский — он приходит из профиля (`use-translation`),
 * а переключателя на экране регистрации нет. Английская ветка сейчас недостижима из
 * браузера и существует ради того дня, когда переключатель появится: правило «документ
 * на языке подписи» должно быть уже зашито, а не дописываться задним числом.
 */
const websiteBaseUrl = (import.meta.env?.VITE_WEBSITE_URL ?? 'http://localhost:4321').replace(
  /\/$/,
  '',
)

function documentUrl(locale: Locale, path: string) {
  return locale === 'en' ? `${websiteBaseUrl}/en${path}` : `${websiteBaseUrl}${path}`
}

export function offerUrl(locale: Locale) {
  return documentUrl(locale, '/offer')
}

export function privacyUrl(locale: Locale) {
  return documentUrl(locale, '/privacy')
}

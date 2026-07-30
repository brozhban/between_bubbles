/**
 * Адреса правовых страниц.
 *
 * Документы живут на `website`, а форма регистрации — на своём домене, поэтому
 * относительной ссылки не хватает: база приходит из сборки, как и адрес API.
 * Без этих ссылок галочка согласия отсылала бы к тексту, который негде прочитать (ТЗ §14).
 */
const websiteBaseUrl = (import.meta.env?.VITE_WEBSITE_URL ?? 'http://localhost:4321').replace(
  /\/$/,
  '',
)

export const OFFER_URL = `${websiteBaseUrl}/offer`
export const PRIVACY_URL = `${websiteBaseUrl}/privacy`

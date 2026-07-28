/**
 * Версия оферты и политики конфиденциальности, действующая прямо сейчас.
 *
 * Клиент присылает её при регистрации, сервер записывает вместе с датой согласия (ТЗ §14).
 * Значение живёт в контрактах, чтобы webapp и публичные страницы website не разъехались.
 */
export const CURRENT_TERMS_VERSION = '2026-07-01'

/** Минимальный возраст пользователя. Дублируется в `MIN_AGE_YEARS` для проверок возраста. */
export const AGE_DISCLAIMER_RU =
  'Сервис доступен только совершеннолетним. Чрезмерное употребление алкоголя вредит вашему здоровью.'

export const AGE_DISCLAIMER_EN =
  'This service is for adults only. Excessive alcohol consumption harms your health.'

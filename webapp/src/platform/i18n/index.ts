import type { Locale } from '@between-bubbles/contracts'

import { messages, type MessageKey } from './messages'

export type { MessageKey }
export { messages }

export type TranslateParams = Record<string, string | number>

/**
 * Подстановка `{name}` в подпись. Своя вместо библиотеки: множественных форм здесь нет —
 * там, где нужны числа, подписи сформулированы так, чтобы падеж не менялся («3 бок.»).
 */
export function translate(locale: Locale, key: MessageKey, params?: TranslateParams): string {
  const template = messages[locale][key] ?? messages.ru[key]
  if (!params) return template

  return Object.entries(params).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    template as string,
  )
}

export type Translate = (key: MessageKey, params?: TranslateParams) => string

export function createTranslator(locale: Locale): Translate {
  return (key, params) => translate(locale, key, params)
}

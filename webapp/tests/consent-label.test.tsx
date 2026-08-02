import type { Locale } from '@between-bubbles/contracts'
import { expect, test } from 'bun:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { AuthContext, type AuthContextValue } from '../src/features/auth/context'
import { ConsentLabel } from '../src/features/auth/components/consent-label'
import { messages } from '../src/platform/i18n'
import { offerUrl, privacyUrl } from '../src/platform/legal'

/**
 * Подпись к галочке согласия собирается подстановкой меток `{offer}` и `{privacy}` в
 * переводимое предложение. Метка, потерянная при переводе, не ломает ни типы, ни сборку:
 * ссылка молча станет обычным текстом, а галочка всё равно запишет версию оферты (ТЗ §14) —
 * то есть согласие с документом, который негде открыть. Поэтому проверяем каждую локаль.
 */
const locales = Object.keys(messages) as Locale[]

test.each(locales)('подпись согласия в локали %s ведёт на оба документа', (locale) => {
  const markup = renderConsentLabel(locale)
  const links = [...markup.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/g)].map(
    ([, href, text]) => ({ href, text }),
  )

  expect(links).toEqual([
    { href: offerUrl(locale), text: messages[locale]['auth.consentOffer'] },
    { href: privacyUrl(locale), text: messages[locale]['auth.consentPrivacy'] },
  ])
})

test.each(locales)('в локали %s не остаётся неподставленных меток', (locale) => {
  const text = renderConsentLabel(locale).replace(/<[^>]*>/g, '')

  expect(text).not.toContain('{offer}')
  expect(text).not.toContain('{privacy}')
})

/**
 * Локаль берётся из профиля, а до входа она всегда русская, поэтому английская ветка не
 * достижима из браузера и e2e её не поймает. Контекст здесь — единственная граница, на
 * которой язык можно задать, не подменяя ни переводы, ни сам компонент.
 */
function renderConsentLabel(locale: Locale) {
  const auth = { user: { locale } } as AuthContextValue

  return renderToStaticMarkup(
    <AuthContext.Provider value={auth}>
      <ConsentLabel id="consent-label" />
    </AuthContext.Provider>,
  )
}

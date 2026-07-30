import { expect, test } from 'bun:test'

import { offerUrl, privacyUrl } from '../src/platform/legal'

/**
 * Галочка согласия записывает версию оферты в базу (ТЗ §14), поэтому ссылка обязана вести
 * на документ на языке интерфейса: согласие на английском под русским текстом — это
 * согласие с тем, чего человек не читал.
 */
test('правовые ссылки ведут на документ на языке интерфейса', () => {
  expect(offerUrl('ru')).toMatch(/\/offer$/)
  expect(privacyUrl('ru')).toMatch(/\/privacy$/)
  expect(offerUrl('en')).toMatch(/\/en\/offer$/)
  expect(privacyUrl('en')).toMatch(/\/en\/privacy$/)
})

test('адрес сайта не задваивает слэш', () => {
  for (const url of [offerUrl('ru'), offerUrl('en'), privacyUrl('ru'), privacyUrl('en')]) {
    expect(url.replace(/^https?:\/\//, '')).not.toContain('//')
  }
})

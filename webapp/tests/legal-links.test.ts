import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
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

/**
 * Базовый адрес читается один раз при загрузке модуля, поэтому подменить его внутри уже
 * запущенного процесса нельзя — адреса берём из отдельного прогона с нужным окружением.
 * Слэш на конце `VITE_WEBSITE_URL` приходит из реальных настроек деплоя, а `//` в пути
 * увёл бы галочку согласия на 404.
 */
test('слэш на конце VITE_WEBSITE_URL не задваивается в адресе документа', () => {
  const urls = resolveLegalUrls('https://docs.example.com/')

  expect(urls).toEqual({
    offerRu: 'https://docs.example.com/offer',
    offerEn: 'https://docs.example.com/en/offer',
    privacyRu: 'https://docs.example.com/privacy',
    privacyEn: 'https://docs.example.com/en/privacy',
  })
})

/**
 * Запасной `http://localhost:4321` спасает только разработку. В продакшене он означает
 * галочку согласия, которая записывает версию оферты и ведёт в никуда, — и увидеть это можно
 * лишь кликнув по ссылке на боевом сайте. Поэтому продакшен-сборка обязана падать без адреса,
 * и здесь проверяется именно падение: снятый страж не роняет ни один другой тест.
 *
 * Проверяются только отказы: конфиг валится до бандлинга, поэтому тест быстрый, а успешный
 * путь и так гоняет `bun run build` в CI.
 */
test.each([
  ['не задан', ''],
  ['без схемы', 'winesdiary.com'],
])('продакшен-сборка дневника падает, если адрес сайта %s', (_case, websiteUrl) => {
  const result = spawnSync('bunx', ['vite', 'build', '--mode', 'production'], {
    cwd: resolve(import.meta.dirname, '..'),
    encoding: 'utf8',
    env: { ...process.env, VITE_WEBSITE_URL: websiteUrl },
  })

  expect(result.status).not.toBe(0)
  expect(`${result.stdout}\n${result.stderr}`).toContain('VITE_WEBSITE_URL')
})

function resolveLegalUrls(websiteUrl: string) {
  const modulePath = resolve(import.meta.dirname, '../src/platform/legal.ts')
  const result = spawnSync(
    'bun',
    [
      '-e',
      `const { offerUrl, privacyUrl } = await import(${JSON.stringify(modulePath)})
       console.log(JSON.stringify({
         offerRu: offerUrl('ru'),
         offerEn: offerUrl('en'),
         privacyRu: privacyUrl('ru'),
         privacyEn: privacyUrl('en'),
       }))`,
    ],
    { encoding: 'utf8', env: { ...process.env, VITE_WEBSITE_URL: websiteUrl } },
  )

  expect(result.status).toBe(0)

  return JSON.parse(result.stdout)
}

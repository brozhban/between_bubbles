import path from 'node:path'
import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Адрес сайта обязан быть в продакшен-сборке: на нём лежат оферта и политика, а галочка
 * согласия записывает версию оферты в базу (ТЗ §14). Без переменной бандл молча уходит
 * на запасной `http://localhost:4321`, и человек соглашается с документом, который ему
 * негде открыть, — а сборка при этом зелёная.
 *
 * Проверка живёт в сборке, а не в рантайме: упавшая сборка на App Platform оставляет
 * работать прошлую версию, а выкатившийся бандл со сломанными ссылками — нет. Локально
 * значение приходит из `.env` (см. `.env.example`), в продакшене — из спеки деплоя.
 */
function assertWebsiteUrl(mode: string) {
  if (mode !== 'production') return

  const value = loadEnv(mode, __dirname, 'VITE_').VITE_WEBSITE_URL?.trim()
  const isAbsoluteHttpUrl = value !== undefined && /^https?:\/\/[^/]+/.test(value)

  if (!isAbsoluteHttpUrl) {
    throw new Error(
      'VITE_WEBSITE_URL must be an absolute http(s) URL in a production build: the registration ' +
        'consent checkbox links to the legal documents hosted there. ' +
        'Local builds read it from webapp/.env (see webapp/.env.example); deployments get it from ' +
        '`bun run deploy:do:specs webapp`, which requires DO_WEBSITE_URL.',
    )
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  assertWebsiteUrl(mode)

  return {
    build: {
      rolldownOptions: {
        output: {
          strictExecutionOrder: true,
          codeSplitting: {
            groups: [
              {
                name: 'react-vendor',
                test: /node_modules[\\/](?:react|react-dom|scheduler)[\\/]/,
                priority: 30,
              },
              {
                name: 'tanstack-vendor',
                test: /node_modules[\\/]@tanstack[\\/]/,
                priority: 20,
              },
              {
                name: 'vendor',
                test: /node_modules/,
                priority: 10,
              },
            ],
          },
        },
      },
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
      dedupe: ['react', 'react-dom'],
    },
  }
})

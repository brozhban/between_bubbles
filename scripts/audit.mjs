#!/usr/bin/env bun
import { spawnSync } from 'node:child_process'

/**
 * Проверка зависимостей на уязвимости с повторами.
 *
 * `bun audit` ходит в реестр по сети и возвращает тот же код выхода и когда нашёл уязвимости,
 * и когда сам реестр ответил ошибкой. Из-за этого пятиминутный сбой на чужой стороне валил
 * всю сборку. Отличаем одно от другого по тексту ответа: находки — это провал проверки,
 * недоступность реестра — повод повторить, а если не помогло, предупредить и пропустить.
 *
 * Пропуск безопаснее упрямства: уязвимость никуда не денется и всплывёт на следующем прогоне,
 * а вот заблокированная выкладка чинится только правкой конвейера.
 */

const attempts = 3
// Пауза настраивается ради тестов: ждать пять секунд, проверяя логику повторов, незачем.
const delayMs = Number(process.env.AUDIT_RETRY_DELAY_MS ?? 5_000)

/**
 * Находки, которые сознательно не валят сборку. Сюда попадает только то, у чего нет
 * исправленной версии, и только с причиной и условием снятия. Как только исправление
 * выйдет, запись удаляется и пакет обновляется через `overrides`.
 */
const ignoredAdvisories = [
  // braces ≤ 3.0.3, DoS на глубоко вложенных шаблонах. Исправленной версии нет: 3.0.3 —
  // последняя. Приходит только через инструмент разработки shadcn (fast-glob → micromatch),
  // в сборку и на сервер не попадает, а шаблоны в нём — наши, не пользовательские.
  // Снять, когда выйдет braces > 3.0.3.
  'GHSA-vfj7-8cjw-p6xm',
]

const transientPatterns = [
  /audit request failed/i,
  /status 5\d\d/,
  /ECONNRESET|ETIMEDOUT|ENOTFOUND|socket hang up/i,
]

for (let attempt = 1; attempt <= attempts; attempt += 1) {
  const result = spawnSync(
    'bun',
    ['audit', '--audit-level=low', ...ignoredAdvisories.map((id) => `--ignore=${id}`)],
    { encoding: 'utf8' },
  )
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  process.stdout.write(output)

  if (result.status === 0) process.exit(0)

  const isTransient = transientPatterns.some((pattern) => pattern.test(output))
  if (!isTransient) {
    process.stderr.write('\nАудит нашёл уязвимости — смотрите список выше.\n')
    process.exit(1)
  }

  if (attempt < attempts) {
    process.stderr.write(`\nРеестр недоступен, повтор ${attempt + 1} из ${attempts}…\n`)
    await Bun.sleep(delayMs)
  }
}

process.stderr.write(
  '\nРеестр аудита недоступен после трёх попыток — проверка пропущена, сборка продолжается.\n',
)
process.exit(0)

/**
 * Защита общего справочника магазинов от мусора и дублей (ТЗ §5.2, слой 1).
 *
 * Нечёткое сравнение считается в приложении по биграммам, а не в PostgreSQL через `pg_trgm`:
 * кандидатов на сравнение всегда единицы (магазины одной страны с похожим префиксом),
 * а расширение БД потянуло бы за собой ручную миграцию, которых в проекте нет.
 */

/** Порог, при котором пользователю показывается «Возможно, вы имели в виду…». */
export const DUPLICATE_SIMILARITY_THRESHOLD = 0.6

/** Не более 10 новых магазинов от одного пользователя в сутки (ТЗ §5.2, антиспам). */
export const STORE_CREATION_DAILY_LIMIT = 10

const PUNCTUATION = /[.,/#!$%^&*;:{}=\-_`~()"'«»„“”\[\]]/g

/** lowercase + trim + схлопывание пробелов + удаление пунктуации. */
export function normalizeStoreName(name: string): string {
  return name
    .toLowerCase()
    .replace(PUNCTUATION, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Названия со ссылками и разметкой в общий справочник не пускаем. */
export function looksLikeSpam(name: string): boolean {
  return /https?:\/\/|www\.|<[^>]+>|\[url|\{\{/i.test(name)
}

/** Коэффициент Дайса по биграммам: 1 — совпадение, 0 — ничего общего. */
export function nameSimilarity(left: string, right: string): number {
  const a = normalizeStoreName(left)
  const b = normalizeStoreName(right)

  if (a === b) return 1
  if (a.length < 2 || b.length < 2) return 0

  const bigrams = new Map<string, number>()
  for (let index = 0; index < a.length - 1; index += 1) {
    const bigram = a.slice(index, index + 2)
    bigrams.set(bigram, (bigrams.get(bigram) ?? 0) + 1)
  }

  let shared = 0
  for (let index = 0; index < b.length - 1; index += 1) {
    const bigram = b.slice(index, index + 2)
    const available = bigrams.get(bigram) ?? 0
    if (available > 0) {
      bigrams.set(bigram, available - 1)
      shared += 1
    }
  }

  return (2 * shared) / (a.length - 1 + (b.length - 1))
}

export function findDuplicate<T extends { name: string }>(
  name: string,
  candidates: readonly T[],
): (T & { similarity: number }) | null {
  let best: (T & { similarity: number }) | null = null

  for (const candidate of candidates) {
    const similarity = nameSimilarity(name, candidate.name)
    if (similarity < DUPLICATE_SIMILARITY_THRESHOLD) continue
    if (best === null || similarity > best.similarity) {
      best = { ...candidate, similarity }
    }
  }

  return best
}

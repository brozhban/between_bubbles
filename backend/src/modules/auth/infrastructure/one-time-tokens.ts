import { createHash, randomBytes } from 'node:crypto'

/**
 * Токен одноразовой ссылки. 32 случайных байта — перебором не берётся, а в БД уезжает только
 * хеш: утечка таблицы не даёт возможности войти чужой ссылкой (ТЗ §13).
 */
export function createOneTimeToken() {
  return randomBytes(32).toString('base64url')
}

export function hashOneTimeToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

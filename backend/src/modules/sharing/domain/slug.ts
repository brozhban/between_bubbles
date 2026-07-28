import { randomBytes } from 'node:crypto'

/**
 * Slug публичной ссылки (ТЗ §12): криптостойкий и неугадываемый.
 *
 * 12 случайных байт — это 16 символов base64url и 96 бит энтропии: перебирать такую ссылку
 * бессмысленно даже при миллионах попыток. Длина взята с запасом к требованию «12+ символов».
 */
export function createShareSlug(): string {
  return randomBytes(12).toString('base64url')
}

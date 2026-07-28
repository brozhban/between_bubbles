/**
 * Одноразовые ссылки из письма (ТЗ §13): восстановление пароля и подтверждение почты.
 */

/** Восстановление пароля живёт час — ровно как требует ТЗ §13. */
export const PASSWORD_RESET_TTL_SECONDS = 60 * 60

/**
 * Подтверждение почты живёт сутки: письмо часто открывают не сразу, а риск здесь ниже —
 * токен не даёт доступа к аккаунту, он только помечает адрес подтверждённым.
 */
export const EMAIL_VERIFICATION_TTL_SECONDS = 24 * 60 * 60

export type OneTimeTokenKind = 'PASSWORD_RESET' | 'EMAIL_VERIFICATION'

export function oneTimeTokenExpiresAt(now: Date, kind: OneTimeTokenKind): Date {
  const ttlSeconds =
    kind === 'PASSWORD_RESET' ? PASSWORD_RESET_TTL_SECONDS : EMAIL_VERIFICATION_TTL_SECONDS
  return new Date(now.getTime() + ttlSeconds * 1000)
}

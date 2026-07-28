import type { RegisterPayload, UserDto } from '@between-bubbles/contracts'

import type { OneTimeTokenKind } from '../domain/one-time-tokens'
import type { SessionMetadata } from '../domain/session'
import type { AuthUserRecord } from '../domain/user'

export type AccessTokenPayload = {
  sub: string
  sessionId: string
  email: string
}

export type AuthRepository = {
  findUserByEmail(email: string): Promise<AuthUserRecord | null>
  createPasswordUserWithSession(input: {
    user: RegisterPayload & { passwordHash: string }
    session: {
      refreshTokenHash: string
      refreshTokenFamilyHash: string
      expiresAt: Date
      metadata: SessionMetadata
    }
  }): Promise<{ user: AuthUserRecord; session: { id: string } }>
  createSession(input: {
    userId: string
    refreshTokenHash: string
    refreshTokenFamilyHash: string
    expiresAt: Date
    metadata: SessionMetadata
  }): Promise<{ id: string }>
  findActiveRefreshSession(input: {
    refreshTokenHash: string
    refreshTokenFamilyHash: string
    now: Date
    createdAfter: Date
    reuseGraceAfter: Date
  }): Promise<{
    id: string
    userId: string
    user: AuthUserRecord
    refreshTokenHash: string
    credentialState: 'current' | 'previous_within_grace' | 'reused'
  } | null>
  rotateRefreshSession(input: {
    currentSessionId: string
    currentRefreshTokenHash: string
    now: Date
    nextRefreshTokenHash: string
    nextRefreshTokenFamilyHash: string
    nextExpiresAt: Date
    metadata: SessionMetadata
  }): Promise<boolean>
  revokeSessionById(input: { sessionId: string; now: Date }): Promise<boolean>
  findActiveAccessSession(input: {
    sessionId: string
    userId: string
    now: Date
    createdAfter: Date
  }): Promise<{ id: string; user: AuthUserRecord } | null>
  findUserById(userId: string): Promise<AuthUserRecord | null>
  /** Смена пароля и удаление аккаунта обязаны выбросить все живые сессии пользователя. */
  updatePasswordAndRevokeSessions(input: {
    userId: string
    passwordHash: string
    now: Date
  }): Promise<boolean>
  softDeleteUserAndRevokeSessions(input: { userId: string; now: Date }): Promise<boolean>
  revokeSession(input: {
    refreshTokenHash: string
    refreshTokenFamilyHash: string
    now: Date
  }): Promise<string | null>
  /**
   * Выпуск одноразового токена. Прежние неиспользованные того же вида гасятся: запрошенная
   * заново ссылка обязана обесценить предыдущую, иначе старое письмо остаётся отмычкой.
   */
  createOneTimeToken(input: {
    userId: string
    kind: OneTimeTokenKind
    tokenHash: string
    expiresAt: Date
  }): Promise<void>
  /** Гасит токен и возвращает владельца. Повторный переход по той же ссылке уже не сработает. */
  consumeOneTimeToken(input: {
    kind: OneTimeTokenKind
    tokenHash: string
    now: Date
  }): Promise<{ userId: string } | null>
  markEmailVerified(input: { userId: string; now: Date }): Promise<void>
}

export type AccessTokens = {
  sign(payload: AccessTokenPayload): Promise<string>
  verify(token: string): Promise<AccessTokenPayload>
}

export type Passwords = {
  hash(password: string): Promise<string>
  verify(password: string, passwordHash: string): Promise<boolean>
}

export type RefreshTokens = {
  create(): string
  hash(token: string): string
  familyHash(token: string): string
  rotate(token: string): string
}

export type Clock = {
  now(): Date
}

export type OneTimeTokens = {
  create(): string
  hash(token: string): string
}

/**
 * Письма аккаунта. Порт намеренно узкий: сервис решает, кому и когда писать, а текст, ссылка
 * и способ доставки — забота инфраструктуры.
 *
 * Реализация обязана не бросать: сбой доставки не должен ронять регистрацию и не должен
 * превращать «письмо отправлено» в подсказку о том, есть ли такой адрес в дневнике.
 * Ошибки доставки реализация логирует сама.
 */
export type AuthNotifications = {
  passwordReset(input: { email: string; locale: string; token: string }): Promise<void>
  emailVerification(input: { email: string; locale: string; token: string }): Promise<void>
}

export type ProjectUser = (user: AuthUserRecord) => UserDto | Promise<UserDto>
export type LogoutCleanup = (input: { userId: string }) => void | Promise<void>

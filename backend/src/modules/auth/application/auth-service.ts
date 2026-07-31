import { randomUUID } from 'node:crypto'

import type { LoginRequest, RegisterPayload } from '@between-bubbles/contracts'

import { AuthFailure } from '../domain/errors'
import { oneTimeTokenExpiresAt } from '../domain/one-time-tokens'
import { sessionExpiresAt, type SessionMetadata } from '../domain/session'
import type { AuthUserRecord, AuthenticatedPrincipal } from '../domain/user'
import { userDtoFromPrincipal } from '../domain/user'
import type {
  AccessTokens,
  AuthNotifications,
  AuthRepository,
  Clock,
  LogoutCleanup,
  OneTimeTokens,
  Passwords,
  ProjectUser,
  RefreshTokens,
} from './ports'

type AuthServiceDependencies = {
  accessTokens: AccessTokens
  clock: Clock
  logoutCleanup: LogoutCleanup
  notifications: AuthNotifications
  oneTimeTokens: OneTimeTokens
  passwords: Passwords
  projectUser: ProjectUser
  refreshTokenTtlDays: number
  refreshReuseGraceSeconds: number
  sessionAbsoluteTtlDays: number
  refreshTokens: RefreshTokens
  repository: AuthRepository
}

export class AuthService {
  constructor(private readonly dependencies: AuthServiceDependencies) {}

  async register(input: RegisterPayload, metadata: SessionMetadata) {
    const existingUser = await this.dependencies.repository.findUserByEmail(input.email)
    if (existingUser) {
      throw new AuthFailure('email_already_exists', 'User with this email already exists')
    }

    const passwordHash = await this.dependencies.passwords.hash(input.password)
    const now = this.dependencies.clock.now()
    const refreshToken = this.dependencies.refreshTokens.create()
    const { user, session } = await this.dependencies.repository.createPasswordUserWithSession({
      user: { ...input, passwordHash },
      session: {
        refreshTokenHash: this.dependencies.refreshTokens.hash(refreshToken),
        refreshTokenFamilyHash: this.dependencies.refreshTokens.familyHash(refreshToken),
        expiresAt: this.refreshExpiresAt(now),
        metadata,
      },
    })

    // Письмо с подтверждением уходит сразу, но ничего не блокирует: дневником пользуются
    // с первой секунды, а подтверждённый адрес нужен, чтобы было куда восстанавливать пароль.
    await this.requestEmailVerification({ userId: user.id })

    return this.sessionResponse(user, session.id, refreshToken)
  }

  async login(input: LoginRequest, metadata: SessionMetadata) {
    const user = await this.dependencies.repository.findUserByEmail(input.email)

    // Сверка пароля выполняется всегда, даже когда пользователя нет. Иначе короткое
    // замыкание пропускает argon2id и ответ приходит мгновенно, а для существующего адреса
    // — через десятки миллисекунд: этой разницы хватает, чтобы перебрать почты по одному
    // запросу на кандидата, не угадывая пароль.
    const passwordHash = user?.passwordHash ?? (await this.absentUserPasswordHash())
    const passwordMatches = await this.dependencies.passwords.verify(input.password, passwordHash)

    if (!user?.passwordHash || !passwordMatches) {
      throw new AuthFailure('invalid_credentials', 'Invalid email or password')
    }

    return this.issueSession(user, metadata)
  }

  /**
   * Хеш несуществующего пользователя: считается один раз за процесс и ни с чем не совпадает.
   *
   * Ленивая инициализация вместо конструктора — чтобы стоимость не платили те, кто логином
   * не пользуется; первый запрос по неизвестному адресу оплатит её однократно.
   */
  private absentUserPasswordHashPromise: Promise<string> | null = null

  private absentUserPasswordHash(): Promise<string> {
    this.absentUserPasswordHashPromise ??= this.dependencies.passwords.hash(
      `absent-user-${randomUUID()}`,
    )
    return this.absentUserPasswordHashPromise
  }

  async refresh(refreshToken: string | undefined, metadata: SessionMetadata) {
    if (!refreshToken) {
      throw new AuthFailure('refresh_token_required', 'Refresh token is required')
    }

    const now = this.dependencies.clock.now()
    const presentedRefreshTokenHash = this.dependencies.refreshTokens.hash(refreshToken)
    const refreshLookup = {
      refreshTokenHash: presentedRefreshTokenHash,
      refreshTokenFamilyHash: this.dependencies.refreshTokens.familyHash(refreshToken),
      now,
      createdAfter: this.sessionAbsoluteNotBefore(now),
      reuseGraceAfter: new Date(
        now.getTime() - this.dependencies.refreshReuseGraceSeconds * 1000,
      ),
    }
    let currentSession = await this.dependencies.repository.findActiveRefreshSession(refreshLookup)
    if (!currentSession) {
      throw new AuthFailure('refresh_session_invalid', 'Refresh session is invalid or expired')
    }

    if (currentSession.credentialState === 'reused') {
      await this.dependencies.repository.revokeSessionById({
        sessionId: currentSession.id,
        now,
      })
      throw new AuthFailure('refresh_session_invalid', 'Refresh session is invalid or expired')
    }

    const nextRefreshToken = this.dependencies.refreshTokens.rotate(refreshToken)
    const nextRefreshTokenHash = this.dependencies.refreshTokens.hash(nextRefreshToken)
    const nextRefreshTokenFamilyHash = this.dependencies.refreshTokens.familyHash(nextRefreshToken)
    if (currentSession.credentialState === 'previous_within_grace') {
      if (currentSession.refreshTokenHash !== nextRefreshTokenHash) {
        throw new AuthFailure('refresh_session_invalid', 'Refresh session is invalid or expired')
      }
      return this.refreshResponse(currentSession, nextRefreshToken)
    }

    const rotated = await this.dependencies.repository.rotateRefreshSession({
      currentSessionId: currentSession.id,
      currentRefreshTokenHash: currentSession.refreshTokenHash,
      now,
      nextRefreshTokenHash,
      nextRefreshTokenFamilyHash,
      nextExpiresAt: this.refreshExpiresAt(now),
      metadata,
    })
    if (!rotated) {
      const racedSession = await this.dependencies.repository.findActiveRefreshSession(refreshLookup)
      if (!racedSession || racedSession.id !== currentSession.id) {
        throw new AuthFailure('refresh_session_invalid', 'Refresh session is invalid or expired')
      }
      if (racedSession.credentialState === 'reused') {
        await this.dependencies.repository.revokeSessionById({
          sessionId: racedSession.id,
          now,
        })
        throw new AuthFailure('refresh_session_invalid', 'Refresh session is invalid or expired')
      }
      if (
        racedSession.credentialState !== 'previous_within_grace' ||
        racedSession.refreshTokenHash !== nextRefreshTokenHash
      ) {
        throw new AuthFailure('refresh_session_invalid', 'Refresh session is invalid or expired')
      }

      return this.refreshResponse(racedSession, nextRefreshToken)
    }

    return this.refreshResponse(currentSession, nextRefreshToken)
  }

  private async refreshResponse(
    session: { id: string; user: AuthUserRecord },
    refreshToken: string,
  ) {
    return {
      accessToken: await this.dependencies.accessTokens.sign({
        sub: session.user.id,
        email: session.user.email,
        sessionId: session.id,
      }),
      refreshToken,
    }
  }

  async authenticateAccessToken(accessToken: string | undefined): Promise<AuthenticatedPrincipal> {
    if (!accessToken) {
      throw new AuthFailure('access_token_required', 'Access token is required')
    }

    let payload
    try {
      payload = await this.dependencies.accessTokens.verify(accessToken)
    } catch {
      throw new AuthFailure('access_token_invalid', 'Access token is invalid or expired')
    }

    const now = this.dependencies.clock.now()
    const session = await this.dependencies.repository.findActiveAccessSession({
      sessionId: payload.sessionId,
      userId: payload.sub,
      now,
      createdAfter: this.sessionAbsoluteNotBefore(now),
    })
    if (!session) {
      throw new AuthFailure('session_invalid', 'Session is invalid or expired')
    }

    return {
      ...(await this.dependencies.projectUser(session.user)),
      sessionId: session.id,
    }
  }

  async getMe(accessToken: string | undefined) {
    return { user: userDtoFromPrincipal(await this.authenticateAccessToken(accessToken)) }
  }

  /**
   * Смена пароля (ТЗ §10.11). Все сессии, включая текущую, отзываются: пароль меняют
   * в том числе когда подозревают чужой доступ, и оставлять живые сессии бессмысленно.
   */
  async changePassword(input: {
    userId: string
    currentPassword: string
    newPassword: string
  }): Promise<void> {
    const user = await this.dependencies.repository.findUserById(input.userId)
    if (!user?.passwordHash) {
      throw new AuthFailure('invalid_credentials', 'Current password is incorrect')
    }

    const matches = await this.dependencies.passwords.verify(
      input.currentPassword,
      user.passwordHash,
    )
    if (!matches) {
      throw new AuthFailure('invalid_credentials', 'Current password is incorrect')
    }

    const passwordHash = await this.dependencies.passwords.hash(input.newPassword)
    const updated = await this.dependencies.repository.updatePasswordAndRevokeSessions({
      userId: input.userId,
      passwordHash,
      now: this.dependencies.clock.now(),
    })
    if (!updated) {
      throw new AuthFailure('session_invalid', 'Account is no longer active')
    }
  }

  /**
   * Запрос ссылки на восстановление пароля (ТЗ §13).
   *
   * Ответ одинаков для существующего и несуществующего адреса: иначе форма превращается
   * в проверку «есть ли такой человек в дневнике». По той же причине ошибки доставки письма
   * наружу не выносятся.
   */
  async requestPasswordReset(input: { email: string }): Promise<void> {
    const user = await this.dependencies.repository.findUserByEmail(input.email)
    if (!user) return

    const token = await this.issueOneTimeToken(user.id, 'PASSWORD_RESET')
    await this.dependencies.notifications.passwordReset({
      email: user.email,
      locale: user.locale,
      token,
    })
  }

  /**
   * Сброс пароля по ссылке из письма. Все сессии отзываются, как и при обычной смене пароля:
   * ссылкой пользуются в том числе когда доступ к аккаунту перехвачен.
   *
   * Переход по ссылке доказывает владение почтой, поэтому заодно подтверждает адрес — просить
   * человека дважды подтвердить одну и ту же почту незачем.
   */
  async resetPassword(input: { token: string; password: string }): Promise<void> {
    const now = this.dependencies.clock.now()
    const consumed = await this.dependencies.repository.consumeOneTimeToken({
      kind: 'PASSWORD_RESET',
      tokenHash: this.dependencies.oneTimeTokens.hash(input.token),
      now,
    })
    if (!consumed) {
      throw new AuthFailure('one_time_token_invalid', 'Password reset link is invalid or expired')
    }

    const passwordHash = await this.dependencies.passwords.hash(input.password)
    const updated = await this.dependencies.repository.updatePasswordAndRevokeSessions({
      userId: consumed.userId,
      passwordHash,
      now,
    })
    if (!updated) {
      throw new AuthFailure('one_time_token_invalid', 'Password reset link is invalid or expired')
    }

    await this.dependencies.repository.markEmailVerified({ userId: consumed.userId, now })
    await this.dependencies.logoutCleanup({ userId: consumed.userId })
  }

  /** Письмо с подтверждением почты: по кнопке в напоминании и после регистрации (ТЗ §13). */
  async requestEmailVerification(input: { userId: string }): Promise<void> {
    const user = await this.dependencies.repository.findUserById(input.userId)
    if (!user || user.emailVerifiedAt !== null) return

    const token = await this.issueOneTimeToken(user.id, 'EMAIL_VERIFICATION')
    await this.dependencies.notifications.emailVerification({
      email: user.email,
      locale: user.locale,
      token,
    })
  }

  async verifyEmail(input: { token: string }): Promise<void> {
    const now = this.dependencies.clock.now()
    const consumed = await this.dependencies.repository.consumeOneTimeToken({
      kind: 'EMAIL_VERIFICATION',
      tokenHash: this.dependencies.oneTimeTokens.hash(input.token),
      now,
    })
    if (!consumed) {
      throw new AuthFailure('one_time_token_invalid', 'Verification link is invalid or expired')
    }

    await this.dependencies.repository.markEmailVerified({ userId: consumed.userId, now })
  }

  private async issueOneTimeToken(userId: string, kind: 'PASSWORD_RESET' | 'EMAIL_VERIFICATION') {
    const token = this.dependencies.oneTimeTokens.create()
    await this.dependencies.repository.createOneTimeToken({
      userId,
      kind,
      tokenHash: this.dependencies.oneTimeTokens.hash(token),
      expiresAt: oneTimeTokenExpiresAt(this.dependencies.clock.now(), kind),
    })
    return token
  }

  /**
   * Удаление аккаунта (ТЗ §14): мягкое, с полной очисткой фоновой задачей через 30 дней.
   * Пароль спрашивается ещё раз — операция необратима.
   */
  async deleteAccount(input: { userId: string; password: string }): Promise<void> {
    const user = await this.dependencies.repository.findUserById(input.userId)
    if (!user?.passwordHash) {
      throw new AuthFailure('invalid_credentials', 'Password is incorrect')
    }

    const matches = await this.dependencies.passwords.verify(input.password, user.passwordHash)
    if (!matches) {
      throw new AuthFailure('invalid_credentials', 'Password is incorrect')
    }

    const deleted = await this.dependencies.repository.softDeleteUserAndRevokeSessions({
      userId: input.userId,
      now: this.dependencies.clock.now(),
    })
    if (!deleted) {
      throw new AuthFailure('session_invalid', 'Account is no longer active')
    }

    await this.dependencies.logoutCleanup({ userId: input.userId })
  }

  async logout(refreshToken: string | undefined) {
    if (!refreshToken) return false

    const userId = await this.dependencies.repository.revokeSession({
      refreshTokenHash: this.dependencies.refreshTokens.hash(refreshToken),
      refreshTokenFamilyHash: this.dependencies.refreshTokens.familyHash(refreshToken),
      now: this.dependencies.clock.now(),
    })
    if (!userId) return false

    await this.dependencies.logoutCleanup({ userId })
    return true
  }

  private async issueSession(user: AuthUserRecord, metadata: SessionMetadata) {
    const now = this.dependencies.clock.now()
    const refreshToken = this.dependencies.refreshTokens.create()
    const session = await this.dependencies.repository.createSession({
      userId: user.id,
      refreshTokenHash: this.dependencies.refreshTokens.hash(refreshToken),
      refreshTokenFamilyHash: this.dependencies.refreshTokens.familyHash(refreshToken),
      expiresAt: this.refreshExpiresAt(now),
      metadata,
    })

    return this.sessionResponse(user, session.id, refreshToken)
  }

  private async sessionResponse(user: AuthUserRecord, sessionId: string, refreshToken: string) {
    return {
      user: await this.dependencies.projectUser(user),
      accessToken: await this.dependencies.accessTokens.sign({
        sub: user.id,
        email: user.email,
        sessionId,
      }),
      refreshToken,
    }
  }

  private refreshExpiresAt(now: Date) {
    return sessionExpiresAt(now, this.dependencies.refreshTokenTtlDays)
  }

  private sessionAbsoluteNotBefore(now: Date) {
    return new Date(now.getTime() - this.dependencies.sessionAbsoluteTtlDays * 24 * 60 * 60 * 1000)
  }
}

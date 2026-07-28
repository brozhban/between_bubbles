import {
  cookieAuthResponseSchema,
  cookieLogoutRequestSchema,
  cookieRefreshRequestSchema,
  cookieRefreshResponseSchema,
  emailVerifySchema,
  loginRequestSchema,
  meResponseSchema,
  passwordForgotSchema,
  passwordResetSchema,
  registerRequestSchema,
  type CookieAuthResponse,
  type CookieRefreshResponse,
  type EmailVerifyRequest,
  type LoginRequest,
  type MeResponse,
  type PasswordForgotRequest,
  type PasswordResetRequest,
  type RegisterRequest,
} from '@between-bubbles/contracts'
import type { z } from 'zod'
import { ApiRequestError, HttpClient, type HttpRequestOptions } from '@/platform/api'
import {
  coordinateBrowserAuthMutation,
  type BrowserAuthCoordinator,
} from './browser-auth-coordinator'
import {
  currentBrowserSessionEpoch,
  isBrowserSessionEpochCurrent,
  publishBrowserSessionState,
} from './session-coordinator'

export type BrowserSessionTransition<T> = {
  data: T
  sessionEpoch: string
}

type AuthApiOptions = {
  getAccessToken: () => string | null
  setAccessToken: (accessToken: string | null) => void
  onAuthExpired?: () => void | Promise<void>
  authCoordinator?: BrowserAuthCoordinator
}

class BrowserSessionEpochChangedError extends Error {}

export class AuthApi {
  private readonly options: AuthApiOptions
  private readonly http: HttpClient
  private readonly authCoordinator: BrowserAuthCoordinator
  private readonly sessionEpoch: string
  private refreshInFlight: {
    epoch: string
    promise: Promise<CookieRefreshResponse>
  } | null = null

  constructor(options: AuthApiOptions, http = new HttpClient()) {
    this.options = options
    this.http = http
    this.authCoordinator = options.authCoordinator ?? coordinateBrowserAuthMutation
    this.sessionEpoch = currentBrowserSessionEpoch()
  }

  register(input: RegisterRequest): Promise<BrowserSessionTransition<CookieAuthResponse>> {
    const payload = registerRequestSchema.parse(input)
    return this.authCoordinator(async () => {
      const data = await this.http.request('/api/auth/register', cookieAuthResponseSchema, {
        method: 'POST',
        body: payload,
      })
      const sessionEvent = publishBrowserSessionState('authenticated')
      return { data, sessionEpoch: sessionEvent.epoch }
    })
  }

  login(input: LoginRequest): Promise<BrowserSessionTransition<CookieAuthResponse>> {
    const payload = loginRequestSchema.parse(input)
    return this.authCoordinator(async () => {
      const data = await this.http.request('/api/auth/login', cookieAuthResponseSchema, {
        method: 'POST',
        body: payload,
      })
      const sessionEvent = publishBrowserSessionState('authenticated')
      return { data, sessionEpoch: sessionEvent.epoch }
    })
  }

  refresh(expectedEpoch = this.sessionEpoch): Promise<CookieRefreshResponse> {
    if (this.refreshInFlight?.epoch === expectedEpoch) return this.refreshInFlight.promise

    const refreshPromise = this.authCoordinator(async () => {
      if (!this.isSessionEpochCurrent(expectedEpoch)) {
        throw new BrowserSessionEpochChangedError('Browser auth session changed')
      }

      const payload = cookieRefreshRequestSchema.parse({})
      try {
        return await this.http.request('/api/auth/refresh', cookieRefreshResponseSchema, {
          method: 'POST',
          body: payload,
        })
      } catch (error) {
        if (error instanceof ApiRequestError && error.status === 401) {
          await this.expireSessionWithinMutation(expectedEpoch)
        }
        throw error
      }
    })
    const trackedPromise = refreshPromise.finally(() => {
      if (this.refreshInFlight?.promise === trackedPromise) this.refreshInFlight = null
    })
    this.refreshInFlight = { epoch: expectedEpoch, promise: trackedPromise }

    return trackedPromise
  }

  me(): Promise<MeResponse> {
    return this.requestAuthenticated('/api/auth/me', meResponseSchema)
  }

  /**
   * Смена пароля и удаление аккаунта отвечают 204 без тела, поэтому идут мимо
   * `requestAuthenticated`, который разбирает JSON. Обновлять токен на 401 здесь тоже
   * не нужно: 401 означает неверный пароль, а не протухшую сессию.
   */
  async changePassword(input: { currentPassword: string; newPassword: string }): Promise<void> {
    await this.rawAuthenticated('/api/auth/password', input)
    await this.clearSession()
  }

  async deleteAccount(input: { password: string; confirm: true }): Promise<void> {
    await this.rawAuthenticated('/api/auth/account/delete', input)
    await this.clearSession()
  }

  /**
   * Восстановление пароля и подтверждение почты (ТЗ §13). Сессия здесь не нужна: право
   * действовать доказывает сам токен из письма, поэтому запросы идут мимо всей машинерии
   * с обновлением access-токена.
   */
  async requestPasswordReset(input: PasswordForgotRequest): Promise<void> {
    await this.http.raw('/api/auth/password/forgot', {
      method: 'POST',
      body: passwordForgotSchema.parse(input),
    })
  }

  async resetPassword(input: PasswordResetRequest): Promise<void> {
    await this.http.raw('/api/auth/password/reset', {
      method: 'POST',
      body: passwordResetSchema.parse(input),
    })
    // Сброс пароля отзывает все сессии, включая эту вкладку.
    await this.clearSession()
  }

  async verifyEmail(input: EmailVerifyRequest): Promise<void> {
    await this.http.raw('/api/auth/email/verify', {
      method: 'POST',
      body: emailVerifySchema.parse(input),
    })
  }

  async requestEmailVerification(): Promise<void> {
    await this.rawAuthenticated('/api/auth/email/verify/request', {})
  }

  private async rawAuthenticated(path: string, body: unknown) {
    const accessToken = this.options.getAccessToken()
    const headers = new Headers()
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)

    return this.http.raw(path, { method: 'POST', body, headers })
  }

  logout(): Promise<BrowserSessionTransition<undefined> | null> {
    return this.authCoordinator(async () => {
      if (!this.isSessionEpochCurrent(this.sessionEpoch)) return null

      const payload = cookieLogoutRequestSchema.parse({})
      await this.http.raw('/api/auth/logout', {
        method: 'POST',
        body: payload,
      })
      const sessionEvent = publishBrowserSessionState('cleared')
      this.options.setAccessToken(null)
      return { data: undefined, sessionEpoch: sessionEvent.epoch }
    })
  }

  async clearSession() {
    return this.authCoordinator(() => this.expireSessionWithinMutation(this.sessionEpoch))
  }

  isSessionEpochCurrent(epoch: string) {
    return isBrowserSessionEpochCurrent(epoch)
  }

  async requestAuthenticated<TSchema extends z.ZodType>(
    path: string,
    schema: TSchema,
    options: HttpRequestOptions = {},
  ): Promise<z.infer<TSchema>> {
    return this.performAuthenticatedRequest(
      path,
      options,
      (requestOptions) => this.http.request(path, schema, requestOptions),
    )
  }

  /** Тот же путь с обновлением токена, но для ответов без тела — разбирать нечего. */
  async requestVoid(path: string, options: HttpRequestOptions = {}): Promise<void> {
    await this.performAuthenticatedRequest(path, options, async (requestOptions) => {
      await this.http.raw(path, requestOptions)
    })
  }

  /** Тот же путь для файлов: тело уходит браузеру как есть, имя файла назначает сервер. */
  async requestFile(
    path: string,
    options: HttpRequestOptions = {},
  ): Promise<{ blob: Blob; fileName: string | null }> {
    return this.performAuthenticatedRequest(path, options, async (requestOptions) => {
      const response = await this.http.raw(path, requestOptions)
      return {
        blob: await response.blob(),
        fileName: fileNameFromContentDisposition(response.headers.get('content-disposition')),
      }
    })
  }

  private async performAuthenticatedRequest<TResult>(
    path: string,
    options: HttpRequestOptions,
    send: (options: HttpRequestOptions) => Promise<TResult>,
    accessTokenOverride?: string,
  ): Promise<TResult> {
    const requestEpoch = this.sessionEpoch
    const accessToken = accessTokenOverride ?? this.options.getAccessToken()
    const headers = new Headers(options.headers)
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)

    try {
      const response = await send({ ...options, headers })
      if (!this.isSessionEpochCurrent(requestEpoch)) {
        throw new BrowserSessionEpochChangedError('Browser auth session changed')
      }
      return response
    } catch (error) {
      if (!(error instanceof ApiRequestError) || error.status !== 401 || accessTokenOverride) {
        throw error
      }

      if (!this.isSessionEpochCurrent(requestEpoch)) throw error

      let refreshed: CookieRefreshResponse
      try {
        refreshed = await this.refresh(requestEpoch)
      } catch (refreshError) {
        if (refreshError instanceof BrowserSessionEpochChangedError) throw error
        throw refreshError
      }
      if (!this.isSessionEpochCurrent(requestEpoch)) throw error
      if (!accessToken || !hasSamePrincipal(accessToken, refreshed.accessToken)) {
        this.options.setAccessToken(null)
        await this.options.onAuthExpired?.()
        throw error
      }

      this.options.setAccessToken(refreshed.accessToken)
      return this.performAuthenticatedRequest(path, options, send, refreshed.accessToken)
    }
  }

  private async expireSessionWithinMutation(expectedEpoch: string) {
    if (!this.isSessionEpochCurrent(expectedEpoch)) return false

    publishBrowserSessionState('cleared')
    this.options.setAccessToken(null)
    await this.options.onAuthExpired?.()
    return true
  }
}

function fileNameFromContentDisposition(header: string | null): string | null {
  const match = header === null ? null : /filename="([^"]+)"/.exec(header)
  return match?.[1] ?? null
}

function hasSamePrincipal(currentAccessToken: string, nextAccessToken: string) {
  const currentSubject = accessTokenSubject(currentAccessToken)
  const nextSubject = accessTokenSubject(nextAccessToken)
  return currentSubject !== null && currentSubject === nextSubject
}

function accessTokenSubject(accessToken: string) {
  const payload = accessToken.split('.')[1]
  if (!payload) return null

  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0))
    const decoded = JSON.parse(new TextDecoder().decode(bytes)) as { sub?: unknown }
    return typeof decoded.sub === 'string' ? decoded.sub : null
  } catch {
    return null
  }
}

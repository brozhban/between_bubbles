import { afterAll, beforeEach, describe, expect, test } from 'bun:test'

import { createApp } from '../../app'
import { createPrisma } from '../../db'
import type { AppEnv } from '../../env'
import { CURRENT_TERMS_VERSION } from '@between-bubbles/contracts'

const databaseUrl = process.env.TEST_DATABASE_URL

const maybeDescribe = databaseUrl ? describe : describe.skip

maybeDescribe('auth API integration', () => {
  const env: AppEnv = {
    PORT: 3000,
    DATABASE_URL: databaseUrl!,
    JWT_SECRET: '12345678901234567890123456789012',
    CORS_ORIGINS: ['http://localhost:5173'],
    ACCESS_TOKEN_TTL_SECONDS: 60,
    REFRESH_TOKEN_TTL_DAYS: 30,
    REFRESH_REUSE_GRACE_SECONDS: 10,
    SESSION_ABSOLUTE_TTL_DAYS: 90,
    SESSION_RETENTION_DAYS: 7,
    AUTH_BODY_LIMIT_BYTES: 64 * 1024,
    AUTH_RATE_LIMIT_MAX: 60,
    AUTH_RATE_LIMIT_WINDOW_SECONDS: 60,
    SHUTDOWN_GRACE_SECONDS: 20,
    TRUST_PROXY: false,
    COOKIE_SECURE: false,
    SPACES_UPLOAD_MAX_BYTES: 10 * 1024 * 1024,
    SPACES_UPLOAD_URL_TTL_SECONDS: 900,
    SPACES_DOWNLOAD_URL_TTL_SECONDS: 300,
    SPACES_PUBLIC_CACHE_CONTROL: 'public, max-age=31536000, immutable',
  }
  const prisma = createPrisma(databaseUrl!)
  const app = createApp({ env, prisma })

  beforeEach(async () => {
    await prisma.authSession.deleteMany()
    await prisma.user.deleteMany()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  test('registers, reads me, refreshes, and logs out', async () => {
    const register = await app.request('/api/auth/token/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'user@example.com',
        password: 'quiet-cellar-42',
        birthDate: '1990-01-01',
        acceptedTermsVersion: CURRENT_TERMS_VERSION,
        displayName: 'User',
      }),
    })
    const registerBody = await register.json()

    expect(register.status).toBe(201)
    expect(registerBody.user.email).toBe('user@example.com')
    expect(registerBody.accessToken).toBeString()
    expect(registerBody.refreshToken).toBeString()
    expect(register.headers.get('set-cookie')).toBeNull()

    const me = await app.request('/api/auth/me', {
      headers: {
        Authorization: `Bearer ${registerBody.accessToken}`,
      },
    })
    expect(me.status).toBe(200)
    const meBody = await me.json()
    expect(meBody).toEqual({ user: registerBody.user })
    expect('sessionId' in meBody.user).toBe(false)

    const refresh = await app.request('/api/auth/token/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken: registerBody.refreshToken }),
    })
    const refreshBody = await refresh.json()
    expect(refresh.status).toBe(200)
    expect(refreshBody.accessToken).toBeString()
    expect(refreshBody.refreshToken).toBeString()
    expect(refreshBody.refreshToken).not.toBe(registerBody.refreshToken)
    expect(refresh.headers.get('set-cookie')).toBeNull()

    const meWithPreRefreshAccessToken = await app.request('/api/auth/me', {
      headers: {
        Authorization: `Bearer ${registerBody.accessToken}`,
      },
    })
    expect(meWithPreRefreshAccessToken.status).toBe(200)

    const sessionsAfterRefresh = await prisma.authSession.count({
      where: {
        user: {
          email: 'user@example.com',
        },
      },
    })
    expect(sessionsAfterRefresh).toBe(1)

    const staleRefresh = await app.request('/api/auth/token/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken: registerBody.refreshToken }),
    })
    const staleRefreshBody = await staleRefresh.json()
    expect(staleRefresh.status).toBe(200)
    expect(staleRefreshBody.refreshToken).toBeString()

    const logout = await app.request('/api/auth/token/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken: staleRefreshBody.refreshToken }),
    })
    expect(logout.status).toBe(204)

    const revokedRefresh = await app.request('/api/auth/token/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken: staleRefreshBody.refreshToken }),
    })
    expect(revokedRefresh.status).toBe(401)
  })

  test('returns one durable successor across three concurrent refresh requests', async () => {
    const register = await app.request('/api/auth/token/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'race@example.com',
        password: 'quiet-cellar-42',
        birthDate: '1990-01-01',
        acceptedTermsVersion: CURRENT_TERMS_VERSION,
      }),
    })
    const registerBody = await register.json()

    const refreshRequests = await Promise.all([
      app.request('/api/auth/token/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken: registerBody.refreshToken }),
      }),
      app.request('/api/auth/token/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken: registerBody.refreshToken }),
      }),
      app.request('/api/auth/token/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken: registerBody.refreshToken }),
      }),
    ])

    const statuses = refreshRequests.map((response) => response.status)
    expect(statuses).toEqual([200, 200, 200])
    const refreshBodies = await Promise.all(refreshRequests.map((response) => response.json()))
    const returnedRefreshTokens = refreshBodies.map((body) => body.refreshToken)
    expect(new Set(returnedRefreshTokens).size).toBe(1)

    const activeSessions = await prisma.authSession.count({
      where: {
        user: {
          email: 'race@example.com',
        },
        revokedAt: null,
      },
    })
    expect(activeSessions).toBe(1)

    const totalSessions = await prisma.authSession.count({
      where: {
        user: {
          email: 'race@example.com',
        },
      },
    })
    expect(totalSessions).toBe(1)

    await prisma.authSession.updateMany({
      where: { user: { email: 'race@example.com' } },
      data: { refreshRotatedAt: new Date(Date.now() - 60_000) },
    })

    const delayedWinner = await app.request('/api/auth/token/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: returnedRefreshTokens.at(-1) }),
    })
    expect(delayedWinner.status).toBe(200)
  })

  test('revokes a session when any older refresh credential is reused after grace', async () => {
    const register = await app.request('/api/auth/token/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'reuse@example.com', password: 'quiet-cellar-42', birthDate: '1990-01-01', acceptedTermsVersion: CURRENT_TERMS_VERSION }),
    })
    const registered = await register.json()
    const refresh = await app.request('/api/auth/token/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: registered.refreshToken }),
    })
    const refreshed = await refresh.json()

    const refreshAgain = await app.request('/api/auth/token/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refreshed.refreshToken }),
    })
    const refreshedAgain = await refreshAgain.json()
    expect(refreshAgain.status).toBe(200)

    await prisma.authSession.updateMany({
      where: { user: { email: 'reuse@example.com' } },
      data: { refreshRotatedAt: new Date(Date.now() - 60_000) },
    })

    const replay = await app.request('/api/auth/token/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: registered.refreshToken }),
    })
    expect(replay.status).toBe(401)

    const attackerCredential = await app.request('/api/auth/token/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refreshedAgain.refreshToken }),
    })
    expect(attackerCredential.status).toBe(401)
  })

  test('web auth never exposes its HttpOnly refresh token when the client platform header is spoofed', async () => {
    const register = await app.request('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Platform': 'mobile',
      },
      body: JSON.stringify({
        email: 'web-cookie@example.com',
        password: 'quiet-cellar-42',
        birthDate: '1990-01-01',
        acceptedTermsVersion: CURRENT_TERMS_VERSION,
      }),
    })
    const registerBody = await register.json()
    const setCookie = register.headers.get('set-cookie')

    expect(register.status).toBe(201)
    expect(registerBody.refreshToken).toBeUndefined()
    expect(setCookie).toContain('between_bubbles_refresh=')
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('SameSite=Lax')

    const refresh = await app.request('/api/auth/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: setCookie!.split(';')[0],
        'X-Client-Platform': 'mobile',
      },
      body: JSON.stringify({}),
    })
    const refreshBody = await refresh.json()

    expect(refresh.status).toBe(200)
    expect(refreshBody.accessToken).toBeString()
    expect(refreshBody.refreshToken).toBeUndefined()
  })

  test('does not let cookie and explicit token transports borrow each other credentials', async () => {
    const refreshToken = 'r'.repeat(32)
    const cookieWithBodyToken = await app.request('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
    expect(cookieWithBodyToken.status).toBe(400)

    const tokenWithCookieOnly = await app.request('/api/auth/token/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `between_bubbles_refresh=${refreshToken}`,
      },
      body: JSON.stringify({}),
    })
    expect(tokenWithCookieOnly.status).toBe(400)
  })

  test('production web auth allows an exact same-site custom-domain origin', async () => {
    const productionApp = createApp({
      env: {
        ...env,
        CORS_ORIGINS: ['https://web.example.com'],
        COOKIE_SECURE: true,
        // Прод-подобные cookie тесту нужны, настоящий провайдер почты — нет.
        NODE_ENV: 'test' as const,
      },
      prisma,
    })
    const register = await productionApp.request('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://web.example.com',
      },
      body: JSON.stringify({
        email: 'production-cookie@example.com',
        password: 'quiet-cellar-42',
        birthDate: '1990-01-01',
        acceptedTermsVersion: CURRENT_TERMS_VERSION,
      }),
    })
    const registerBody = await register.json()
    const setCookie = register.headers.get('set-cookie')

    expect(register.status).toBe(201)
    expect(register.headers.get('access-control-allow-origin')).toBe('https://web.example.com')
    expect(register.headers.get('access-control-allow-credentials')).toBe('true')
    expect(registerBody.refreshToken).toBeUndefined()
    expect(setCookie).toContain('between_bubbles_refresh=')
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('Secure')
    expect(setCookie).toContain('SameSite=None')
  })

  test('production cookie auth rejects untrusted refresh and logout origins', async () => {
    const productionApp = createApp({
      env: {
        ...env,
        CORS_ORIGINS: ['https://web.example.com'],
        COOKIE_SECURE: true,
        // Прод-подобные cookie тесту нужны, настоящий провайдер почты — нет.
        NODE_ENV: 'test' as const,
      },
      prisma,
    })
    const register = await productionApp.request('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://web.example.com',
      },
      body: JSON.stringify({
        email: 'csrf-cookie@example.com',
        password: 'quiet-cellar-42',
        birthDate: '1990-01-01',
        acceptedTermsVersion: CURRENT_TERMS_VERSION,
      }),
    })
    const cookie = register.headers.get('set-cookie')!.split(';')[0]

    const noOriginRefresh = await productionApp.request('/api/auth/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
      },
      body: JSON.stringify({}),
    })
    const noOriginBody = await noOriginRefresh.json()
    expect(noOriginRefresh.status).toBe(403)
    expect(noOriginBody.error.code).toBe('FORBIDDEN')

    const untrustedLogout = await productionApp.request('/api/auth/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
        Origin: 'https://attacker.example',
      },
      body: JSON.stringify({}),
    })
    const untrustedLogoutBody = await untrustedLogout.json()
    expect(untrustedLogout.status).toBe(403)
    expect(untrustedLogoutBody.error.code).toBe('FORBIDDEN')

    const allowedRefresh = await productionApp.request('/api/auth/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
        Origin: 'https://web.example.com',
      },
      body: JSON.stringify({}),
    })
    expect(allowedRefresh.status).toBe(200)
  })

  test('password change revokes every session and only the new password works', async () => {
    const first = await registerForMeGuard('rotate-password@example.com')
    const second = await app.request('/api/auth/token/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'rotate-password@example.com', password: 'quiet-cellar-42' }),
    })
    const secondSession = await second.json()

    const changed = await app.request('/api/auth/password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${first.accessToken}`,
      },
      body: JSON.stringify({ currentPassword: 'quiet-cellar-42', newPassword: 'new-password-123' }),
    })
    expect(changed.status).toBe(204)

    // Обе сессии, а не только та, из которой меняли пароль.
    for (const accessToken of [first.accessToken, secondSession.accessToken]) {
      const me = await app.request('/api/auth/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      expect(me.status).toBe(401)
    }

    const oldPassword = await app.request('/api/auth/token/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'rotate-password@example.com', password: 'quiet-cellar-42' }),
    })
    expect(oldPassword.status).toBe(401)

    const newPassword = await app.request('/api/auth/token/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'rotate-password@example.com', password: 'new-password-123' }),
    })
    expect(newPassword.status).toBe(200)
  })

  /**
   * Токен живёт только в письме, поэтому тест читает его оттуда же, откуда прочитает человек.
   * Заодно это проверяет, что ссылка вообще собирается и попадает в письмо.
   */
  async function captureEmailedTokens(action: () => unknown): Promise<string[]> {
    const tokens: string[] = []
    const originalLog = console.log
    console.log = (...args: unknown[]) => {
      const match = /token=([A-Za-z0-9_-]+)/.exec(args.join(' '))
      if (match?.[1]) tokens.push(decodeURIComponent(match[1]))
    }

    try {
      await action()
    } finally {
      console.log = originalLog
    }

    return tokens
  }

  const forgotPassword = (email: string) =>
    app.request('/api/auth/password/forgot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })

  test('reset link sets a new password and drops every live session', async () => {
    const email = 'forgot@example.com'
    const session = await registerForMeGuard(email)

    const [token] = await captureEmailedTokens(async () => {
      expect((await forgotPassword(email)).status).toBe(204)
    })
    expect(token).toBeString()

    const reset = await app.request('/api/auth/password/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password: 'brand-new-password' }),
    })
    expect(reset.status).toBe(204)

    // Сессия, жившая до сброса, умерла вместе со старым паролем.
    const me = await app.request('/api/auth/me', {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    })
    expect(me.status).toBe(401)

    const withOldPassword = await app.request('/api/auth/token/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'quiet-cellar-42' }),
    })
    expect(withOldPassword.status).toBe(401)

    const withNewPassword = await app.request('/api/auth/token/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'brand-new-password' }),
    })
    expect(withNewPassword.status).toBe(200)
    // Переход по ссылке из письма доказал владение адресом — подтверждать его отдельно незачем.
    expect((await withNewPassword.json()).user.emailVerified).toBe(true)
  })

  test('reset link works once and dies with its deadline', async () => {
    const email = 'one-shot@example.com'
    await registerForMeGuard(email)

    const [token] = await captureEmailedTokens(() => forgotPassword(email))
    const reset = () =>
      app.request('/api/auth/password/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: 'another-password-1' }),
      })

    expect((await reset()).status).toBe(204)
    // Повторный переход по той же ссылке — 410, а не «пароль сменён ещё раз».
    expect((await reset()).status).toBe(410)

    const [freshToken] = await captureEmailedTokens(() => forgotPassword(email))
    await prisma.authToken.updateMany({
      where: { kind: 'PASSWORD_RESET', usedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })
    const expired = await app.request('/api/auth/password/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: freshToken, password: 'yet-another-pass' }),
    })
    expect(expired.status).toBe(410)
  })

  test('forgot password answers the same for an address nobody registered', async () => {
    const tokens = await captureEmailedTokens(async () => {
      const response = await forgotPassword('nobody@example.com')
      // Ответ такой же, как для существующего адреса: форма не должна работать проверкой,
      // заведён ли в дневнике конкретный человек.
      expect(response.status).toBe(204)
    })

    expect(tokens).toEqual([])
    expect(await prisma.authToken.count()).toBe(0)
  })

  test('registration mails a confirmation link that marks the address verified', async () => {
    let accessToken = ''
    const [token] = await captureEmailedTokens(async () => {
      const session = await registerForMeGuard('verify-me@example.com')
      accessToken = session.accessToken
    })
    expect(token).toBeString()

    const before = await app.request('/api/auth/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    // До подтверждения дневник работает полностью — подтверждение ничего не блокирует (ТЗ §13).
    expect(before.status).toBe(200)
    expect((await before.json()).user.emailVerified).toBe(false)

    const verify = await app.request('/api/auth/email/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
    expect(verify.status).toBe(204)

    const after = await app.request('/api/auth/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    expect((await after.json()).user.emailVerified).toBe(true)

    // Повторное письмо подтверждённому адресу не выпускается.
    const repeated = await captureEmailedTokens(() =>
      app.request('/api/auth/email/verify/request', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    )
    expect(repeated).toEqual([])
  })

  test('rejects a password change with the wrong current password', async () => {
    const session = await registerForMeGuard('wrong-password@example.com')

    const response = await app.request('/api/auth/password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.accessToken}`,
      },
      body: JSON.stringify({ currentPassword: 'not-my-password', newPassword: 'another-one-123' }),
    })
    expect(response.status).toBe(401)

    const stillWorks = await app.request('/api/auth/me', {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    })
    expect(stillWorks.status).toBe(200)
  })

  test('deleting an account revokes sessions and blocks a new login', async () => {
    const session = await registerForMeGuard('goodbye@example.com')

    const deleted = await app.request('/api/auth/account/delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.accessToken}`,
      },
      body: JSON.stringify({ password: 'quiet-cellar-42', confirm: true }),
    })
    expect(deleted.status).toBe(204)

    const me = await app.request('/api/auth/me', {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    })
    expect(me.status).toBe(401)

    const login = await app.request('/api/auth/token/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'goodbye@example.com', password: 'quiet-cellar-42' }),
    })
    expect(login.status).toBe(401)

    // Мягкое удаление: строка остаётся до фоновой очистки через 30 дней (ТЗ §14).
    const stored = await prisma.user.findUnique({ where: { email: 'goodbye@example.com' } })
    expect(stored?.deletedAt).not.toBeNull()
  })

  test('guards me and returns stable validation errors', async () => {
    const unauthorizedMe = await app.request('/api/auth/me')
    expect(unauthorizedMe.status).toBe(401)

    const invalidRegister = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'not-an-email',
        password: 'short',
      }),
    })
    const body = await invalidRegister.json()

    expect(invalidRegister.status).toBe(400)
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(body.error.message).toBe('Invalid request payload')
    expect(Array.isArray(body.error.details)).toBe(true)
  })

  test('me rejects revoked, expired, and missing sessions', async () => {
    const revoked = await registerForMeGuard('me-revoked@example.com')
    await prisma.authSession.updateMany({
      where: {
        userId: revoked.userId,
      },
      data: {
        revokedAt: new Date(),
      },
    })
    const revokedMe = await app.request('/api/auth/me', {
      headers: {
        Authorization: `Bearer ${revoked.accessToken}`,
      },
    })
    expect(revokedMe.status).toBe(401)

    const expired = await registerForMeGuard('me-expired@example.com')
    await prisma.authSession.updateMany({
      where: {
        userId: expired.userId,
      },
      data: {
        expiresAt: new Date(Date.now() - 1000),
      },
    })
    const expiredMe = await app.request('/api/auth/me', {
      headers: {
        Authorization: `Bearer ${expired.accessToken}`,
      },
    })
    expect(expiredMe.status).toBe(401)

    const missing = await registerForMeGuard('me-missing@example.com')
    await prisma.authSession.deleteMany({
      where: {
        userId: missing.userId,
      },
    })
    const missingMe = await app.request('/api/auth/me', {
      headers: {
        Authorization: `Bearer ${missing.accessToken}`,
      },
    })
    expect(missingMe.status).toBe(401)
  })

  test('enforces absolute session lifetime in PostgreSQL for access and refresh credentials', async () => {
    const absoluteExpired = await registerForMeGuard('absolute-expired@example.com')
    await prisma.authSession.updateMany({
      where: { userId: absoluteExpired.userId },
      data: {
        createdAt: new Date(
          Date.now() - (env.SESSION_ABSOLUTE_TTL_DAYS * 24 * 60 * 60 + 60) * 1000,
        ),
      },
    })

    const expiredMe = await app.request('/api/auth/me', {
      headers: { Authorization: `Bearer ${absoluteExpired.accessToken}` },
    })
    const expiredRefresh = await app.request('/api/auth/token/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: absoluteExpired.refreshToken }),
    })

    expect(expiredMe.status).toBe(401)
    expect(expiredRefresh.status).toBe(401)

    const nearCutoff = await registerForMeGuard('absolute-near-cutoff@example.com')
    await prisma.authSession.updateMany({
      where: { userId: nearCutoff.userId },
      data: {
        createdAt: new Date(
          Date.now() - (env.SESSION_ABSOLUTE_TTL_DAYS * 24 * 60 * 60 - 60) * 1000,
        ),
      },
    })

    const activeMe = await app.request('/api/auth/me', {
      headers: { Authorization: `Bearer ${nearCutoff.accessToken}` },
    })
    const activeRefresh = await app.request('/api/auth/token/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: nearCutoff.refreshToken }),
    })

    expect(activeMe.status).toBe(200)
    expect(activeRefresh.status).toBe(200)
  })

  test('rejects duplicate email and invalid login', async () => {
    const payload = {
      email: 'dupe@example.com',
      password: 'quiet-cellar-42',
        birthDate: '1990-01-01',
        acceptedTermsVersion: CURRENT_TERMS_VERSION,
    }

    await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const duplicate = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    expect(duplicate.status).toBe(409)

    const invalidLogin = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: payload.email,
        password: 'wrong-password',
      }),
    })
    expect(invalidLogin.status).toBe(401)
  })

  test('returns one created user and one conflict for concurrent duplicate registration', async () => {
    const payload = {
      email: 'register-race@example.com',
      password: 'quiet-cellar-42',
        birthDate: '1990-01-01',
        acceptedTermsVersion: CURRENT_TERMS_VERSION,
    }

    const [first, second] = await Promise.all([
      app.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
      app.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    ])

    const statuses = [first.status, second.status].sort((left, right) => left - right)
    expect(statuses).toEqual([201, 409])

    const users = await prisma.user.count({
      where: {
        email: payload.email,
      },
    })
    expect(users).toBe(1)
  })

  async function registerForMeGuard(email: string) {
    const register = await app.request('/api/auth/token/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password: 'quiet-cellar-42',
        birthDate: '1990-01-01',
        acceptedTermsVersion: CURRENT_TERMS_VERSION,
      }),
    })
    const registerBody = await register.json()
    const user = await prisma.user.findUniqueOrThrow({
      where: {
        email,
      },
      select: {
        id: true,
      },
    })

    expect(register.status).toBe(201)
    expect(registerBody.accessToken).toBeString()

    return {
      accessToken: registerBody.accessToken as string,
      refreshToken: registerBody.refreshToken as string,
      userId: user.id,
    }
  }
})

import type { DbClient } from '../../db'
import type { AppEnv } from '../../env'
import { AuthService } from './application/auth-service'
import type { Clock, LogoutCleanup, ProjectUser } from './application/ports'
import { toBaseUserDto } from './domain/user'
import { createPrismaAuthRepository } from './infrastructure/auth-repository'
import { signAccessToken, verifyAccessToken } from './infrastructure/access-tokens'
import {
  createAuthNotifications,
  createLogMailer,
  createResendMailer,
} from './infrastructure/notifications'
import { createOneTimeToken, hashOneTimeToken } from './infrastructure/one-time-tokens'
import { hashPassword, verifyPassword } from './infrastructure/passwords'
import {
  createRefreshToken,
  deriveRotatedRefreshToken,
  hashRefreshToken,
  hashRefreshTokenFamily,
} from './infrastructure/refresh-tokens'
import { createRequireAuth, type AuthHttpEnv } from './transport/middleware'
import { createAuthRoutes } from './transport/routes'

type CreateAuthModuleOptions = {
  clock?: Clock
  db: DbClient
  env: AppEnv
  logoutCleanup?: LogoutCleanup
  projectUser?: ProjectUser
}

const systemClock: Clock = {
  now: () => new Date(),
}

const noLogoutCleanup: LogoutCleanup = () => undefined

/** Настоящая отправка появляется вместе с ключом; без него письма видны только в логе. */
function createMailer(env: AppEnv) {
  return env.RESEND_API_KEY && env.MAIL_FROM
    ? createResendMailer({ apiKey: env.RESEND_API_KEY, from: env.MAIL_FROM })
    : createLogMailer({ isProduction: env.NODE_ENV === 'production' })
}

export function createAuthModule({
  clock = systemClock,
  db,
  env,
  logoutCleanup = noLogoutCleanup,
  projectUser = toBaseUserDto,
}: CreateAuthModuleOptions) {
  const service = new AuthService({
    accessTokens: {
      sign: (payload) => signAccessToken(payload, env),
      verify: (token) => verifyAccessToken(token, env),
    },
    clock,
    logoutCleanup,
    notifications: createAuthNotifications({
      mailer: createMailer(env),
      // Ссылка из письма ведёт в webapp; локально это первый разрешённый CORS-origin.
      webappUrl: env.PUBLIC_WEBAPP_URL ?? env.CORS_ORIGINS[0] ?? 'http://localhost:5173',
    }),
    oneTimeTokens: {
      create: createOneTimeToken,
      hash: hashOneTimeToken,
    },
    passwords: {
      hash: hashPassword,
      verify: verifyPassword,
    },
    projectUser,
    refreshTokenTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
    refreshReuseGraceSeconds: env.REFRESH_REUSE_GRACE_SECONDS,
    sessionAbsoluteTtlDays: env.SESSION_ABSOLUTE_TTL_DAYS,
    refreshTokens: {
      create: createRefreshToken,
      hash: hashRefreshToken,
      familyHash: (token) => hashRefreshTokenFamily(token, env.JWT_SECRET),
      rotate: (token) => deriveRotatedRefreshToken(token, env.JWT_SECRET),
    },
    repository: createPrismaAuthRepository(db),
  })
  const requireAuth = createRequireAuth((accessToken) => service.authenticateAccessToken(accessToken))

  return {
    authenticateAccessToken: (accessToken: string | undefined) =>
      service.authenticateAccessToken(accessToken),
    requireAuth,
    routes: createAuthRoutes({ env, requireAuth, service }),
  }
}

export type { AuthHttpEnv }
export type { LogoutCleanup, ProjectUser } from './application/ports'
export type { AuthenticatedPrincipal, AuthUserRecord } from './domain/user'
/** Публичный маппинг пользователя в DTO: им пользуются и `/me`, и настройки профиля. */
export { toBaseUserDto } from './domain/user'

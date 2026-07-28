import { OpenAPIHono } from '@hono/zod-openapi'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'

import type { DbClient } from './db'
import type { AppEnv } from './env'
import { errorResponse, handleError, validationErrorHook } from './http/errors'
import { createAuthSecurity } from './http/security'
import { createAdminModule, createAdminRoster } from './modules/admin'
import { createAuthModule, toBaseUserDto, type AuthHttpEnv } from './modules/auth'
import { createDiaryModule } from './modules/diary'
import { createPhotoModule, MEDIA_ROUTE_PATH } from './modules/photos'
import { createProfileModule } from './modules/profile'
import { createSharingModule } from './modules/sharing'

type CreateAppOptions = {
  env: AppEnv
  prisma: DbClient
}

export function createApp({ env, prisma }: CreateAppOptions) {
  // Роль администратора — список почт в конфиге (ТЗ §2). Читает его приложение и
  // подставляет признак в общий DTO пользователя, чтобы клиент знал, показывать ли админку.
  const roster = createAdminRoster(env.ADMIN_EMAILS)
  const projectUser = (user: Parameters<typeof toBaseUserDto>[0]) => ({
    ...toBaseUserDto(user),
    isAdmin: roster.includes(user.email),
  })
  const auth = createAuthModule({ db: prisma, env, projectUser })
  const photos = createPhotoModule({
    db: prisma,
    env,
    requireAuth: auth.requireAuth,
    publicBackendUrl: env.PUBLIC_BACKEND_URL ?? `http://localhost:${env.PORT}`,
  })
  const diary = createDiaryModule({
    db: prisma,
    requireAuth: auth.requireAuth,
    photos: photos.reader,
    photoFiles: photos.photoFiles,
  })
  const profile = createProfileModule({ db: prisma, requireAuth: auth.requireAuth, projectUser })
  const admin = createAdminModule({ db: prisma, requireAuth: auth.requireAuth, roster })
  // Публичную страницу записи отдаёт сам бэкенд (ТЗ §12), поэтому адрес ссылки — его адрес.
  const sharing = createSharingModule({
    db: prisma,
    requireAuth: auth.requireAuth,
    entries: diary.entryReader,
    publicBaseUrl: env.PUBLIC_BACKEND_URL ?? `http://localhost:${env.PORT}`,
  })
  const app = new OpenAPIHono<AuthHttpEnv>({
    defaultHook: validationErrorHook,
  })

  // Фото клиент показывает со своего домена, а бэкенд живёт на другом: с политикой
  // `same-origin` (она стоит по умолчанию) браузер отказывается рисовать такую картинку —
  // `ERR_BLOCKED_BY_RESPONSE.NotSameOrigin`. Доступ к `/media` всё равно даёт подписанная
  // ссылка со сроком годности, а не совпадение origin.
  const defaultHeaders = secureHeaders()
  const mediaHeaders = secureHeaders({ crossOriginResourcePolicy: 'cross-origin' })
  app.use('*', (c, next) =>
    c.req.path === MEDIA_ROUTE_PATH ? mediaHeaders(c, next) : defaultHeaders(c, next),
  )
  app.use(
    '*',
    cors({
      origin: (origin) => {
        if (!origin) return env.CORS_ORIGINS[0] ?? null
        return env.CORS_ORIGINS.includes(origin) ? origin : null
      },
      allowHeaders: ['Content-Type', 'Authorization'],
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      // Имя файла выгрузки назначает сервер, а браузер по умолчанию прячет этот заголовок
      // от JS на чужом origin — без явного разрешения скачивание получило бы имя вида «blob».
      exposeHeaders: ['Content-Disposition'],
      credentials: true,
      maxAge: 600,
    }),
  )
  for (const middleware of createAuthSecurity({
    bodyLimitBytes: env.AUTH_BODY_LIMIT_BYTES,
    rateLimitMax: env.AUTH_RATE_LIMIT_MAX,
    rateLimitWindowSeconds: env.AUTH_RATE_LIMIT_WINDOW_SECONDS,
    trustProxy: env.TRUST_PROXY,
    trustedProxyClientIpHeader: env.TRUSTED_PROXY_CLIENT_IP_HEADER,
    trustedProxyClientIpPosition: env.TRUSTED_PROXY_CLIENT_IP_POSITION,
  })) {
    app.use('/api/auth/*', middleware)
  }
  app.get('/', (c) => {
    return c.json({
      name: 'Between Bubbles backend',
      status: 'ok',
    })
  })

  app.get('/health', (c) => {
    return c.json({
      status: 'ok',
    })
  })

  app.get('/health/live', (c) => {
    return c.json({
      status: 'ok',
    })
  })

  app.get('/health/ready', async (c) => {
    try {
      await prisma.$queryRaw`SELECT 1`
      return c.json({ status: 'ok' }, 200)
    } catch {
      return c.json({ status: 'unavailable' }, 503)
    }
  })

  app.route('/api/auth', auth.routes)
  app.route('/api', diary.routes)
  app.route('/api', photos.routes)
  app.route('/api', profile.routes)
  app.route('/api', sharing.routes)
  app.route('/api', admin.routes)
  // Публичная страница записи живёт вне /api: её открывают из мессенджера без сессии.
  app.route('/', sharing.publicRoutes)
  // Локальная отдача фото по подписанной ссылке; в проде фото идут напрямую из Spaces.
  if (photos.mediaRoutes) {
    app.route('/', photos.mediaRoutes)
  }

  app.doc('/openapi.json', {
    openapi: '3.0.0',
    info: {
      title: 'Between Bubbles API',
      version: '1.0.0',
    },
  })

  app.notFound((c) => c.json(errorResponse('NOT_FOUND', 'Route not found'), 404))
  app.onError(handleError)

  return app
}

export type AppType = ReturnType<typeof createApp>

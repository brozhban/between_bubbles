import {
  apiErrorSchema,
  shareCreateSchema,
  shareLinkResponseSchema,
  shareLinkSchema,
  shareUpdateSchema,
} from '@between-bubbles/contracts'
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { Hono, type MiddlewareHandler } from 'hono'

import { AppError, validationErrorHook } from '../../../http/errors'
import type { AuthHttpEnv } from '../../auth'
import type { ShareService } from '../application/share-service'
import { ShareFailure } from '../domain/errors'

const errorContent = { 'application/json': { schema: apiErrorSchema } }

const idParamSchema = z.object({
  id: z.string().uuid().openapi({ param: { name: 'id', in: 'path' } }),
})

const commonErrors = {
  401: { content: errorContent, description: 'Authentication required' },
  404: { content: errorContent, description: 'Entry or share link not found' },
}

const getShareRoute = createRoute({
  method: 'get',
  path: '/entries/{id}/share',
  request: { params: idParamSchema },
  responses: {
    ...commonErrors,
    200: {
      content: { 'application/json': { schema: shareLinkResponseSchema } },
      description: 'Active share link or null',
    },
  },
})

const createShareRoute = createRoute({
  method: 'post',
  path: '/entries/{id}/share',
  request: { params: idParamSchema, body: { content: { 'application/json': { schema: shareCreateSchema } } } },
  responses: {
    ...commonErrors,
    201: {
      content: { 'application/json': { schema: shareLinkSchema } },
      description: 'Share link for the entry',
    },
  },
})

const updateShareRoute = createRoute({
  method: 'patch',
  path: '/entries/{id}/share',
  request: { params: idParamSchema, body: { content: { 'application/json': { schema: shareUpdateSchema } } } },
  responses: {
    ...commonErrors,
    200: {
      content: { 'application/json': { schema: shareLinkSchema } },
      description: 'Updated share link',
    },
  },
})

const revokeShareRoute = createRoute({
  method: 'delete',
  path: '/entries/{id}/share',
  request: { params: idParamSchema },
  responses: {
    ...commonErrors,
    204: { description: 'Share link revoked' },
  },
})

type CreateShareRoutesOptions = {
  share: ShareService
  requireAuth: MiddlewareHandler<AuthHttpEnv>
}

export function createShareRoutes({ share, requireAuth }: CreateShareRoutesOptions) {
  const routes = new OpenAPIHono<AuthHttpEnv>({ defaultHook: validationErrorHook })

  routes.use('*', requireAuth)

  routes.openapi(getShareRoute, async (c) => {
    const link = await execute(() =>
      share.getLink({ userId: c.var.user.id, entryId: c.req.valid('param').id }),
    )
    return c.json({ share: link }, 200)
  })

  routes.openapi(createShareRoute, async (c) => {
    const link = await execute(() =>
      share.createLink({
        userId: c.var.user.id,
        entryId: c.req.valid('param').id,
        showName: c.req.valid('json').showName,
      }),
    )
    return c.json(link, 201)
  })

  routes.openapi(updateShareRoute, async (c) => {
    const link = await execute(() =>
      share.updateLink({
        userId: c.var.user.id,
        entryId: c.req.valid('param').id,
        showName: c.req.valid('json').showName,
      }),
    )
    return c.json(link, 200)
  })

  routes.openapi(revokeShareRoute, async (c) => {
    await execute(() =>
      share.revokeLink({ userId: c.var.user.id, entryId: c.req.valid('param').id }),
    )
    return c.body(null, 204)
  })

  return routes
}

/**
 * Публичная страница записи (ТЗ §10.2). Живёт вне `/api` и без авторизации: право смотреть
 * даёт сам неугадываемый адрес.
 */
export function createPublicShareRoutes(share: ShareService) {
  const routes = new Hono()

  routes.get('/w/:slug', async (c) => {
    const page = await share.renderPage(c.req.param('slug'))

    return c.html(page.html, page.status, {
      // Страницу открывают из мессенджера, поэтому её встраивают и превьюшат чужие домены.
      'Cross-Origin-Resource-Policy': 'cross-origin',
      // Отзыв ссылки должен срабатывать сразу, а не после того, как истечёт чей-то кэш.
      'Cache-Control': 'no-store',
    })
  })

  return routes
}

function execute<T>(operation: () => Promise<T>): Promise<T> {
  return operation().catch((error: unknown) => {
    if (error instanceof ShareFailure) throw new AppError(404, 'NOT_FOUND', error.message)
    throw error
  })
}

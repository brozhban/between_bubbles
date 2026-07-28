import {
  adminStoreListQuerySchema,
  adminStoreListResponseSchema,
  adminStoreMergeSchema,
  adminStoreSchema,
  adminStoreStatusSchema,
  apiErrorSchema,
} from '@between-bubbles/contracts'
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import type { MiddlewareHandler } from 'hono'

import { AppError, validationErrorHook } from '../../../http/errors'
import type { AuthHttpEnv } from '../../auth'
import type { StoreAdminService } from '../application/store-admin-service'
import { AdminFailure } from '../domain/errors'
import type { AdminRoster } from '../domain/roster'

const errorContent = { 'application/json': { schema: apiErrorSchema } }
const json = <T extends z.ZodTypeAny>(schema: T) => ({ 'application/json': { schema } })

const commonErrors = {
  401: { content: errorContent, description: 'Authentication required' },
  404: { content: errorContent, description: 'Not found' },
}

const idParamSchema = z.object({
  id: z.string().uuid().openapi({ param: { name: 'id', in: 'path' } }),
})

const listStoresRoute = createRoute({
  method: 'get',
  path: '/admin/stores',
  request: { query: adminStoreListQuerySchema },
  responses: {
    ...commonErrors,
    200: { content: json(adminStoreListResponseSchema), description: 'Stores for moderation' },
  },
})

const mergeStoreRoute = createRoute({
  method: 'post',
  path: '/admin/stores/{id}/merge',
  request: { params: idParamSchema, body: { content: json(adminStoreMergeSchema) } },
  responses: {
    ...commonErrors,
    200: { content: json(adminStoreSchema), description: 'Master store after the merge' },
    400: { content: errorContent, description: 'Stores cannot be merged this way' },
  },
})

const setStoreStatusRoute = createRoute({
  method: 'patch',
  path: '/admin/stores/{id}',
  request: { params: idParamSchema, body: { content: json(adminStoreStatusSchema) } },
  responses: {
    ...commonErrors,
    200: { content: json(adminStoreSchema), description: 'Updated store' },
  },
})

type CreateAdminRoutesOptions = {
  stores: StoreAdminService
  requireAuth: MiddlewareHandler<AuthHttpEnv>
  roster: AdminRoster
}

export function createAdminRoutes({ stores, requireAuth, roster }: CreateAdminRoutesOptions) {
  const routes = new OpenAPIHono<AuthHttpEnv>({ defaultHook: validationErrorHook })

  routes.use('*', requireAuth)
  /**
   * Не 403, а 404: обычный пользователь не должен даже узнать, что админка существует
   * по этому адресу — ровно та же логика, что и с чужими записями (ТЗ §2).
   */
  routes.use('*', async (c, next) => {
    if (!roster.includes(c.var.user.email)) {
      throw new AppError(404, 'NOT_FOUND', 'Route not found')
    }
    await next()
  })

  routes.openapi(listStoresRoute, async (c) => {
    const items = await execute(() => stores.list(c.req.valid('query')))
    return c.json({ items }, 200)
  })

  routes.openapi(mergeStoreRoute, async (c) => {
    const master = await execute(() =>
      stores.merge({
        sourceId: c.req.valid('param').id,
        targetId: c.req.valid('json').targetId,
      }),
    )
    return c.json(master, 200)
  })

  routes.openapi(setStoreStatusRoute, async (c) => {
    const store = await execute(() =>
      stores.setStatus({
        storeId: c.req.valid('param').id,
        status: c.req.valid('json').status,
      }),
    )
    return c.json(store, 200)
  })

  return routes
}

function execute<T>(operation: () => Promise<T>): Promise<T> {
  return operation().catch((error: unknown) => {
    if (!(error instanceof AdminFailure)) throw error
    throw error.kind === 'not_found'
      ? new AppError(404, 'NOT_FOUND', error.message)
      : new AppError(400, 'BAD_REQUEST', error.message)
  })
}

import {
  apiErrorSchema,
  aromaTagCreateSchema,
  aromaTagListResponseSchema,
  aromaTagSchema,
  deletedResourceSchema,
  entryCreateSchema,
  entryResponseSchema,
  entryUpdateSchema,
  exportQuerySchema,
  statsQuerySchema,
  statsResponseSchema,
  storeCreateSchema,
  storeSchema,
  storeSearchQuerySchema,
  storeSearchResponseSchema,
  trashListResponseSchema,
  trashPurgeResponseSchema,
  weekQuerySchema,
  weekResponseSchema,
  wineDetailResponseSchema,
  wineListQuerySchema,
  wineListResponseSchema,
} from '@between-bubbles/contracts'
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import type { MiddlewareHandler } from 'hono'

import { validationErrorHook } from '../../../http/errors'
import type { AuthHttpEnv } from '../../auth'
import type { DiaryActor, DiaryService } from '../application/diary-service'
import type { StoreService } from '../application/store-service'
import { executeDiary } from './errors'

const errorContent = { 'application/json': { schema: apiErrorSchema } }

const commonErrors = {
  401: { content: errorContent, description: 'Authentication required' },
  404: { content: errorContent, description: 'Not found' },
}

const idParamSchema = z.object({
  id: z.string().uuid().openapi({ param: { name: 'id', in: 'path' } }),
})

const json = <T extends z.ZodTypeAny>(schema: T) => ({ 'application/json': { schema } })

const weekRoute = createRoute({
  method: 'get',
  path: '/week',
  request: { query: weekQuerySchema },
  responses: {
    ...commonErrors,
    200: { content: json(weekResponseSchema), description: 'Week with metrics and entries' },
  },
})

const getEntryRoute = createRoute({
  method: 'get',
  path: '/entries/{id}',
  request: { params: idParamSchema },
  responses: {
    ...commonErrors,
    200: { content: json(entryResponseSchema), description: 'Tasting entry' },
  },
})

const createEntryRoute = createRoute({
  method: 'post',
  path: '/entries',
  request: { body: { content: json(entryCreateSchema) } },
  responses: {
    ...commonErrors,
    201: { content: json(entryResponseSchema), description: 'Created tasting entry' },
    400: { content: errorContent, description: 'Invalid payload' },
  },
})

const updateEntryRoute = createRoute({
  method: 'patch',
  path: '/entries/{id}',
  request: { params: idParamSchema, body: { content: json(entryUpdateSchema) } },
  responses: {
    ...commonErrors,
    200: { content: json(entryResponseSchema), description: 'Updated tasting entry' },
    400: { content: errorContent, description: 'Invalid payload' },
  },
})

const deleteEntryRoute = createRoute({
  method: 'delete',
  path: '/entries/{id}',
  request: { params: idParamSchema },
  responses: {
    ...commonErrors,
    200: { content: json(entryResponseSchema), description: 'Entry moved to trash' },
  },
})

const restoreEntryRoute = createRoute({
  method: 'post',
  path: '/entries/{id}/restore',
  request: { params: idParamSchema },
  responses: {
    ...commonErrors,
    200: { content: json(entryResponseSchema), description: 'Restored tasting entry' },
  },
})

const purgeEntryRoute = createRoute({
  method: 'delete',
  path: '/entries/{id}/permanent',
  request: { params: idParamSchema },
  responses: {
    ...commonErrors,
    200: { content: json(deletedResourceSchema), description: 'Entry deleted permanently' },
  },
})

const trashRoute = createRoute({
  method: 'get',
  path: '/trash',
  responses: {
    ...commonErrors,
    200: { content: json(trashListResponseSchema), description: 'Deleted entries' },
  },
})

const emptyTrashRoute = createRoute({
  method: 'delete',
  path: '/trash',
  responses: {
    ...commonErrors,
    200: { content: json(trashPurgeResponseSchema), description: 'Trash emptied' },
  },
})

const statsRoute = createRoute({
  method: 'get',
  path: '/stats',
  request: { query: statsQuerySchema },
  responses: {
    ...commonErrors,
    200: { content: json(statsResponseSchema), description: 'Diary statistics for the period' },
  },
})

const exportRoute = createRoute({
  method: 'get',
  path: '/export',
  request: { query: exportQuerySchema },
  responses: {
    ...commonErrors,
    200: {
      content: {
        'text/csv': { schema: z.string() },
        'application/json': { schema: z.string() },
      },
      description: 'Diary export as a downloadable file',
    },
  },
})

const listWinesRoute = createRoute({
  method: 'get',
  path: '/wines',
  request: { query: wineListQuerySchema },
  responses: {
    ...commonErrors,
    200: { content: json(wineListResponseSchema), description: 'Personal wine catalogue' },
  },
})

const getWineRoute = createRoute({
  method: 'get',
  path: '/wines/{id}',
  request: { params: idParamSchema },
  responses: {
    ...commonErrors,
    200: { content: json(wineDetailResponseSchema), description: 'Wine with its tastings' },
  },
})

const deleteWineRoute = createRoute({
  method: 'delete',
  path: '/wines/{id}',
  request: { params: idParamSchema },
  responses: {
    ...commonErrors,
    200: { content: json(deletedResourceSchema), description: 'Wine removed from the catalogue' },
    409: { content: errorContent, description: 'Wine still has tasting entries' },
  },
})

const listAromaTagsRoute = createRoute({
  method: 'get',
  path: '/aroma-tags',
  responses: {
    ...commonErrors,
    200: { content: json(aromaTagListResponseSchema), description: 'System and personal tags' },
  },
})

const createAromaTagRoute = createRoute({
  method: 'post',
  path: '/aroma-tags',
  request: { body: { content: json(aromaTagCreateSchema) } },
  responses: {
    ...commonErrors,
    201: { content: json(aromaTagSchema), description: 'Created personal aroma tag' },
  },
})

const searchStoresRoute = createRoute({
  method: 'get',
  path: '/stores',
  request: { query: storeSearchQuerySchema },
  responses: {
    ...commonErrors,
    200: { content: json(storeSearchResponseSchema), description: 'Store suggestions' },
  },
})

const createStoreRoute = createRoute({
  method: 'post',
  path: '/stores',
  request: { body: { content: json(storeCreateSchema) } },
  responses: {
    ...commonErrors,
    201: { content: json(storeSchema), description: 'Created store' },
    429: { content: errorContent, description: 'Daily store creation limit reached' },
  },
})

type CreateDiaryRoutesOptions = {
  diary: DiaryService
  requireAuth: MiddlewareHandler<AuthHttpEnv>
  stores: StoreService
}

export function createDiaryRoutes({ diary, requireAuth, stores }: CreateDiaryRoutesOptions) {
  const routes = new OpenAPIHono<AuthHttpEnv>({ defaultHook: validationErrorHook })

  routes.use('*', requireAuth)

  routes.openapi(weekRoute, async (c) => {
    const week = await executeDiary(() => diary.getWeek(actor(c), c.req.valid('query').date))
    return c.json(week, 200)
  })

  routes.openapi(getEntryRoute, async (c) => {
    const entry = await executeDiary(() => diary.getEntry(actor(c), c.req.valid('param').id))
    return c.json({ entry }, 200)
  })

  routes.openapi(createEntryRoute, async (c) => {
    const entry = await executeDiary(() => diary.createEntry(actor(c), c.req.valid('json')))
    return c.json({ entry }, 201)
  })

  routes.openapi(updateEntryRoute, async (c) => {
    const entry = await executeDiary(() =>
      diary.updateEntry(actor(c), c.req.valid('param').id, c.req.valid('json')),
    )
    return c.json({ entry }, 200)
  })

  routes.openapi(deleteEntryRoute, async (c) => {
    const entry = await executeDiary(() => diary.deleteEntry(actor(c), c.req.valid('param').id))
    return c.json({ entry }, 200)
  })

  routes.openapi(restoreEntryRoute, async (c) => {
    const entry = await executeDiary(() => diary.restoreEntry(actor(c), c.req.valid('param').id))
    return c.json({ entry }, 200)
  })

  routes.openapi(purgeEntryRoute, async (c) => {
    const purged = await executeDiary(() => diary.purgeEntry(actor(c), c.req.valid('param').id))
    return c.json(purged, 200)
  })

  routes.openapi(trashRoute, async (c) => {
    const trash = await executeDiary(() => diary.listTrash(actor(c)))
    return c.json(trash, 200)
  })

  routes.openapi(emptyTrashRoute, async (c) => {
    const purged = await executeDiary(() => diary.emptyTrash(actor(c)))
    return c.json(purged, 200)
  })

  routes.openapi(statsRoute, async (c) => {
    const stats = await executeDiary(() => diary.getStats(actor(c), c.req.valid('query')))
    return c.json(stats, 200)
  })

  routes.openapi(exportRoute, async (c) => {
    const file = await executeDiary(() =>
      diary.exportEntries(actor(c), c.req.valid('query').format),
    )
    // Заголовок с именем файла: браузер должен сохранить выгрузку, а не показать её текстом.
    return c.body(file.body, 200, {
      'Content-Type': file.contentType,
      'Content-Disposition': `attachment; filename="${file.fileName}"`,
    })
  })

  routes.openapi(listWinesRoute, async (c) => {
    const wines = await executeDiary(() => diary.listWines(actor(c), c.req.valid('query')))
    return c.json(wines, 200)
  })

  routes.openapi(getWineRoute, async (c) => {
    const wine = await executeDiary(() => diary.getWine(actor(c), c.req.valid('param').id))
    return c.json(wine, 200)
  })

  routes.openapi(deleteWineRoute, async (c) => {
    const removed = await executeDiary(() => diary.deleteWine(actor(c), c.req.valid('param').id))
    return c.json(removed, 200)
  })

  routes.openapi(listAromaTagsRoute, async (c) => {
    const items = await executeDiary(() => diary.listAromaTags(actor(c)))
    return c.json({ items }, 200)
  })

  routes.openapi(createAromaTagRoute, async (c) => {
    const tag = await executeDiary(() =>
      diary.createAromaTag(actor(c), c.req.valid('json').name),
    )
    return c.json(tag, 201)
  })

  routes.openapi(searchStoresRoute, async (c) => {
    const result = await executeDiary(() => stores.search(c.var.user.id, c.req.valid('query')))
    return c.json(result, 200)
  })

  routes.openapi(createStoreRoute, async (c) => {
    const store = await executeDiary(() => stores.create(c.var.user.id, c.req.valid('json')))
    return c.json(store, 201)
  })

  return routes
}

/** Таймзона, язык и тумблер трат уже лежат в сессии, поэтому чтения профиля не нужно. */
function actor(c: { var: { user: AuthHttpEnv['Variables']['user'] } }): DiaryActor {
  return {
    id: c.var.user.id,
    timezone: c.var.user.timezone,
    showSpendTotals: c.var.user.showSpendTotals,
    locale: c.var.user.locale,
  }
}

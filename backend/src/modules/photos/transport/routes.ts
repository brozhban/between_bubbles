import {
  apiErrorSchema,
  entryPhotoResponseSchema,
  photoUploadQuerySchema,
} from '@between-bubbles/contracts'
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import type { MiddlewareHandler } from 'hono'
import { bodyLimit } from 'hono/body-limit'

import { AppError, errorResponse, validationErrorHook } from '../../../http/errors'
import type { AuthHttpEnv } from '../../auth'
import type { PhotoService } from '../application/photo-service'
import { PhotoFailure } from '../domain/errors'
import { MAX_UPLOAD_BYTES } from '../domain/image'

const errorContent = { 'application/json': { schema: apiErrorSchema } }

const idParamSchema = z.object({
  id: z.string().uuid().openapi({ param: { name: 'id', in: 'path' } }),
})

const photoParamSchema = idParamSchema.extend({
  photoId: z.string().uuid().openapi({ param: { name: 'photoId', in: 'path' } }),
})

const uploadRoute = createRoute({
  method: 'post',
  path: '/entries/{id}/photos',
  request: {
    params: idParamSchema,
    query: photoUploadQuerySchema,
    body: {
      content: { 'application/octet-stream': { schema: z.any() } },
    },
  },
  responses: {
    404: { content: errorContent, description: 'Entry not found' },
    413: { content: errorContent, description: 'Image is too large' },
    422: { content: errorContent, description: 'Not a valid image or the two-photo limit is reached' },
    201: { content: { 'application/json': { schema: entryPhotoResponseSchema } }, description: 'Stored photo' },
  },
})

const deleteRoute = createRoute({
  method: 'delete',
  path: '/entries/{id}/photos/{photoId}',
  request: { params: photoParamSchema },
  responses: {
    404: { content: errorContent, description: 'Photo not found' },
    204: { description: 'Photo deleted' },
  },
})

type CreatePhotoRoutesOptions = {
  photos: PhotoService
  requireAuth: MiddlewareHandler<AuthHttpEnv>
  /** Лимит частоты обращений к фото (ТЗ §13): защищает декодирование и хранилище от потока. */
  rateLimit: MiddlewareHandler
}

export function createPhotoRoutes({ photos, requireAuth, rateLimit }: CreatePhotoRoutesOptions) {
  const routes = new OpenAPIHono<AuthHttpEnv>({ defaultHook: validationErrorHook })

  routes.use('*', rateLimit)
  routes.use('*', requireAuth)
  // Обрыв по размеру на самом потоке: тело больше 10 МБ не доедет до памяти целиком (ТЗ §11).
  routes.use(
    '/entries/:id/photos',
    bodyLimit({
      maxSize: MAX_UPLOAD_BYTES,
      onError: (c) =>
        c.json(errorResponse('PAYLOAD_TOO_LARGE', 'Image exceeds the 10 MB limit'), 413),
    }),
  )

  routes.openapi(uploadRoute, async (c) => {
    const body = await c.req.arrayBuffer()

    const photo = await execute(() =>
      photos.addPhoto({
        userId: c.var.user.id,
        entryId: c.req.valid('param').id,
        kind: c.req.valid('query').kind,
        bytes: new Uint8Array(body),
      }),
    )
    return c.json({ photo }, 201)
  })

  routes.openapi(deleteRoute, async (c) => {
    await execute(() => photos.deletePhoto(c.var.user.id, c.req.valid('param').photoId))
    return c.body(null, 204)
  })

  return routes
}

function execute<T>(operation: () => Promise<T>): Promise<T> {
  return operation().catch((error: unknown) => {
    if (error instanceof PhotoFailure) throw toAppError(error)
    throw error
  })
}

function toAppError(error: PhotoFailure): AppError {
  switch (error.kind) {
    case 'not_found':
      return new AppError(404, 'NOT_FOUND', error.message)
    case 'too_large':
      return new AppError(413, 'PAYLOAD_TOO_LARGE', error.message)
    default:
      // invalid_image и limit_reached — «понятная, но необрабатываемая сущность».
      return new AppError(422, 'VALIDATION_ERROR', error.message)
  }
}

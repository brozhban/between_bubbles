import {
  apiErrorSchema,
  meResponseSchema,
  profileUpdateSchema,
} from '@between-bubbles/contracts'
import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import type { MiddlewareHandler } from 'hono'

import { AppError, validationErrorHook } from '../../../http/errors'
import type { AuthHttpEnv } from '../../auth'
import type { ProfileService } from '../application/profile-service'
import { ProfileFailure } from '../domain/errors'

const errorContent = { 'application/json': { schema: apiErrorSchema } }

const updateProfileRoute = createRoute({
  method: 'patch',
  path: '/profile',
  request: {
    body: { content: { 'application/json': { schema: profileUpdateSchema } } },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: meResponseSchema } },
      description: 'Updated profile settings',
    },
    400: { content: errorContent, description: 'Invalid payload' },
    401: { content: errorContent, description: 'Authentication required' },
    404: { content: errorContent, description: 'Profile not found' },
  },
})

type CreateProfileRoutesOptions = {
  profile: ProfileService
  requireAuth: MiddlewareHandler<AuthHttpEnv>
}

export function createProfileRoutes({ profile, requireAuth }: CreateProfileRoutesOptions) {
  const routes = new OpenAPIHono<AuthHttpEnv>({ defaultHook: validationErrorHook })

  routes.use('*', requireAuth)

  routes.openapi(updateProfileRoute, async (c) => {
    try {
      const user = await profile.updateSettings(c.var.user.id, c.req.valid('json'))
      return c.json({ user }, 200)
    } catch (error) {
      if (error instanceof ProfileFailure) {
        throw new AppError(404, 'NOT_FOUND', error.message)
      }
      throw error
    }
  })

  return routes
}

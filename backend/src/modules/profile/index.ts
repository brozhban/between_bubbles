import type { MiddlewareHandler } from 'hono'

import type { DbClient } from '../../db'
import { toBaseUserDto, type AuthHttpEnv, type ProjectUser } from '../auth'
import { ProfileService } from './application/profile-service'
import { createPrismaProfileRepository } from './infrastructure/profile-repository'
import { createProfileRoutes } from './transport/routes'

type CreateProfileModuleOptions = {
  db: DbClient
  requireAuth: MiddlewareHandler<AuthHttpEnv>
  /**
   * Тот же маппинг, что отдаёт `/api/auth/me`: DTO пользователя не должен раздваиваться,
   * иначе после сохранения настроек клиент получит профиль без роли или без признака почты.
   */
  projectUser?: ProjectUser
}

const defaultProjectUser: ProjectUser = (user) => toBaseUserDto(user)

export function createProfileModule({
  db,
  requireAuth,
  projectUser = defaultProjectUser,
}: CreateProfileModuleOptions) {
  const profile = new ProfileService({
    repository: createPrismaProfileRepository(db),
    projectUser: (user) => projectUser({ ...user, passwordHash: null }),
  })

  return {
    routes: createProfileRoutes({ profile, requireAuth }),
  }
}

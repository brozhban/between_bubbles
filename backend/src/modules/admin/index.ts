import type { MiddlewareHandler } from 'hono'

import type { DbClient } from '../../db'
import type { AuthHttpEnv } from '../auth'
import { StoreAdminService } from './application/store-admin-service'
import { createAdminRoster, type AdminRoster } from './domain/roster'
import { createPrismaAdminStoreRepository } from './infrastructure/admin-store-repository'
import { createAdminRoutes } from './transport/routes'

type CreateAdminModuleOptions = {
  db: DbClient
  requireAuth: MiddlewareHandler<AuthHttpEnv>
  roster: AdminRoster
}

export function createAdminModule({ db, requireAuth, roster }: CreateAdminModuleOptions) {
  const stores = new StoreAdminService(createPrismaAdminStoreRepository(db))

  return {
    routes: createAdminRoutes({ stores, requireAuth, roster }),
  }
}

export { createAdminRoster }
export type { AdminRoster }

import type { MiddlewareHandler } from 'hono'

import type { DbClient } from '../../db'
import type { AuthHttpEnv } from '../auth'
import type { SharedEntryReader } from './application/ports'
import { ShareService } from './application/share-service'
import {
  createPrismaAuthorReader,
  createPrismaShareRepository,
} from './infrastructure/share-repository'
import { createPublicShareRoutes, createShareRoutes } from './transport/routes'

type CreateSharingModuleOptions = {
  db: DbClient
  requireAuth: MiddlewareHandler<AuthHttpEnv>
  /** Запись публикация берёт у дневника: своей копии читателя записей у неё нет. */
  entries: SharedEntryReader
  /**
   * Домен, на котором открывается `/w/{slug}`. Страницу отдаёт сам бэкенд, поэтому это его
   * собственный адрес, а не адрес webapp.
   */
  publicBaseUrl: string
  clock?: { now(): Date }
}

const systemClock = { now: () => new Date() }

export function createSharingModule({
  db,
  requireAuth,
  entries,
  publicBaseUrl,
  clock = systemClock,
}: CreateSharingModuleOptions) {
  const share = new ShareService({
    repository: createPrismaShareRepository(db),
    authors: createPrismaAuthorReader(db),
    entries,
    publicBaseUrl,
    clock,
  })

  return {
    routes: createShareRoutes({ share, requireAuth }),
    publicRoutes: createPublicShareRoutes(share),
  }
}

export type { SharedEntryReader } from './application/ports'

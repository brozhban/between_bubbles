import {
  adminStoreListResponseSchema,
  adminStoreSchema,
  type AdminStoreListQuery,
} from '@between-bubbles/contracts'

import type { AuthenticatedTransport } from '@/platform/api'

export type AdminStoreListParams = Partial<AdminStoreListQuery>

/** Админка справочника магазинов (ТЗ §10.12). Пользовательских данных здесь нет. */
export class AdminApi {
  private readonly transport: AuthenticatedTransport

  constructor(transport: AuthenticatedTransport) {
    this.transport = transport
  }

  stores(params: AdminStoreListParams = {}) {
    return this.transport.request(`/api/admin/stores${query(params)}`, adminStoreListResponseSchema)
  }

  mergeStore(storeId: string, targetId: string) {
    return this.transport.request(`/api/admin/stores/${storeId}/merge`, adminStoreSchema, {
      method: 'POST',
      body: { targetId },
    })
  }

  setStoreStatus(storeId: string, status: 'ACTIVE' | 'HIDDEN') {
    return this.transport.request(`/api/admin/stores/${storeId}`, adminStoreSchema, {
      method: 'PATCH',
      body: { status },
    })
  }
}

function query(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue
    search.set(key, String(value))
  }

  const serialized = search.toString()
  return serialized ? `?${serialized}` : ''
}

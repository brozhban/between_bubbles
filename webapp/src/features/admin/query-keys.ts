import type { AdminStoreListParams } from './api'
import { sessionQueryKeys } from '@/platform/query-keys'

/** Справочник админки — тоже сессионные данные: доступ к нему определяет вошедший человек. */
export const adminKeys = {
  all: [...sessionQueryKeys.all, 'admin'] as const,
  stores: (params: AdminStoreListParams) => [...adminKeys.all, 'stores', params] as const,
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'

import { useAuth } from '@/features/auth'
import { AdminApi, type AdminStoreListParams } from './api'

export const adminKeys = {
  all: ['admin'] as const,
  stores: (params: AdminStoreListParams) => ['admin', 'stores', params] as const,
}

export function useAdminApi() {
  const { transport } = useAuth()
  return useMemo(() => new AdminApi(transport), [transport])
}

export function useAdminStoresQuery(params: AdminStoreListParams) {
  const api = useAdminApi()
  const { user } = useAuth()

  return useQuery({
    queryKey: adminKeys.stores(params),
    queryFn: () => api.stores(params),
    // Не админ не должен даже стучаться в эти адреса: сервер ответит 404, а экран и так закрыт.
    enabled: user?.isAdmin === true,
  })
}

/** Любая правка справочника меняет и список, и подсказки магазинов в форме записи. */
function useAdminMutation<TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminKeys.all })
      await queryClient.invalidateQueries({ queryKey: ['diary', 'stores'] })
    },
  })
}

export function useMergeStoreMutation() {
  const api = useAdminApi()
  return useAdminMutation((input: { storeId: string; targetId: string }) =>
    api.mergeStore(input.storeId, input.targetId),
  )
}

export function useSetStoreStatusMutation() {
  const api = useAdminApi()
  return useAdminMutation((input: { storeId: string; status: 'ACTIVE' | 'HIDDEN' }) =>
    api.setStoreStatus(input.storeId, input.status),
  )
}

import type { ProfileUpdatePayload } from '@between-bubbles/contracts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'

import { authQueryKeys, useAuth } from '@/features/auth'
import { ProfileApi } from './api'

export function useProfileApi() {
  const { transport } = useAuth()
  return useMemo(() => new ProfileApi(transport), [transport])
}

/**
 * После сохранения кладём свежего пользователя прямо в кэш сессии: язык, тема и валюта
 * читаются из него по всему приложению, и ждать рефетча значит показать старую тему.
 * Дневник инвалидируем отдельно — от `showSpendTotals` зависят метрики недели.
 */
export function useUpdateProfileMutation() {
  const api = useProfileApi()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: ProfileUpdatePayload) => api.updateSettings(input),
    onSuccess: (response) => {
      queryClient.setQueryData(authQueryKeys.me(), response)
      void queryClient.invalidateQueries({ queryKey: ['diary'] })
    },
  })
}

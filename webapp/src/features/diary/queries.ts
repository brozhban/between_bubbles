import type {
  EntryCreateRequest,
  EntryUpdateRequest,
  PhotoKind,
  StatsPeriod,
} from '@between-bubbles/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'

import { useAuth } from '@/features/auth'
import { DiaryApi, type WineListParams } from './api'

export const diaryKeys = {
  all: ['diary'] as const,
  week: (date?: string) => ['diary', 'week', date ?? 'current'] as const,
  entry: (entryId: string) => ['diary', 'entry', entryId] as const,
  trash: () => ['diary', 'trash'] as const,
  wines: (params: WineListParams) => ['diary', 'wines', params] as const,
  wine: (wineId: string) => ['diary', 'wine', wineId] as const,
  aromaTags: () => ['diary', 'aroma-tags'] as const,
  share: (entryId: string) => ['diary', 'share', entryId] as const,
  stats: (period: string) => ['diary', 'stats', period] as const,
  stores: (query: string, country?: string) => ['diary', 'stores', query, country] as const,
}

export function useDiaryApi() {
  const { transport } = useAuth()
  return useMemo(() => new DiaryApi(transport), [transport])
}

export function useWeekQuery(date?: string) {
  const api = useDiaryApi()
  const { isAuthenticated } = useAuth()

  return useQuery({
    queryKey: diaryKeys.week(date),
    queryFn: () => api.week(date),
    enabled: isAuthenticated,
  })
}

export function useEntryQuery(entryId: string | undefined) {
  const api = useDiaryApi()

  return useQuery({
    queryKey: diaryKeys.entry(entryId ?? ''),
    queryFn: () => api.entry(entryId!),
    enabled: Boolean(entryId),
  })
}

export function useWinesQuery(params: WineListParams) {
  const api = useDiaryApi()
  const { isAuthenticated } = useAuth()

  return useQuery({
    queryKey: diaryKeys.wines(params),
    queryFn: () => api.wines(params),
    enabled: isAuthenticated,
  })
}

export function useWineQuery(wineId: string | undefined) {
  const api = useDiaryApi()

  return useQuery({
    queryKey: diaryKeys.wine(wineId ?? ''),
    queryFn: () => api.wine(wineId!),
    enabled: Boolean(wineId),
  })
}

export function useStatsQuery(period: StatsPeriod) {
  const api = useDiaryApi()
  const { isAuthenticated } = useAuth()

  return useQuery({
    queryKey: diaryKeys.stats(period),
    queryFn: () => api.stats(period),
    enabled: isAuthenticated,
  })
}

export function useTrashQuery() {
  const api = useDiaryApi()
  const { isAuthenticated } = useAuth()

  return useQuery({
    queryKey: diaryKeys.trash(),
    queryFn: () => api.trash(),
    enabled: isAuthenticated,
  })
}

export function useAromaTagsQuery() {
  const api = useDiaryApi()
  const { isAuthenticated } = useAuth()

  return useQuery({
    queryKey: diaryKeys.aromaTags(),
    queryFn: () => api.aromaTags(),
    enabled: isAuthenticated,
  })
}

export function useStoreSearchQuery(input: { q: string; country?: string; enabled?: boolean }) {
  const api = useDiaryApi()

  return useQuery({
    queryKey: diaryKeys.stores(input.q, input.country),
    queryFn: () => api.searchStores({ q: input.q, country: input.country }),
    enabled: input.enabled ?? true,
  })
}

/**
 * Любая мутация записи может изменить сразу несколько экранов: неделю (метрики пересчитываются
 * на сервере), корзину, справочник вин. Поэтому инвалидируем весь префикс дневника —
 * точечная инвалидация здесь стоила бы дороже, чем один лишний перезапрос.
 */
function useDiaryMutation<TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: diaryKeys.all }),
  })
}

export function useCreateEntryMutation() {
  const api = useDiaryApi()
  return useDiaryMutation((input: EntryCreateRequest) => api.createEntry(input))
}

export function useUpdateEntryMutation() {
  const api = useDiaryApi()
  return useDiaryMutation((input: { entryId: string; payload: EntryUpdateRequest }) =>
    api.updateEntry(input.entryId, input.payload),
  )
}

export function useTrashEntryMutation() {
  const api = useDiaryApi()
  return useDiaryMutation((entryId: string) => api.trashEntry(entryId))
}

export function useRestoreEntryMutation() {
  const api = useDiaryApi()
  return useDiaryMutation((entryId: string) => api.restoreEntry(entryId))
}

export function usePurgeEntryMutation() {
  const api = useDiaryApi()
  return useDiaryMutation((entryId: string) => api.purgeEntry(entryId))
}

export function useEmptyTrashMutation() {
  const api = useDiaryApi()
  return useDiaryMutation(() => api.emptyTrash())
}

/** Публикация записи (ТЗ §12). */
export function useShareQuery(entryId: string) {
  const api = useDiaryApi()
  const { isAuthenticated } = useAuth()

  return useQuery({
    queryKey: diaryKeys.share(entryId),
    queryFn: () => api.share(entryId),
    enabled: isAuthenticated,
  })
}

export function useCreateShareMutation() {
  const api = useDiaryApi()
  return useDiaryMutation((input: { entryId: string; showName: boolean }) =>
    api.createShare(input.entryId, input.showName),
  )
}

export function useUpdateShareMutation() {
  const api = useDiaryApi()
  return useDiaryMutation((input: { entryId: string; showName: boolean }) =>
    api.updateShare(input.entryId, input.showName),
  )
}

export function useRevokeShareMutation() {
  const api = useDiaryApi()
  return useDiaryMutation((input: { entryId: string }) => api.revokeShare(input.entryId))
}

export function useUploadPhotoMutation() {
  const api = useDiaryApi()
  return useDiaryMutation(
    (input: { entryId: string; kind: PhotoKind; bytes: Uint8Array }) =>
      api.uploadPhoto(input.entryId, input.kind, input.bytes),
  )
}

export function useDeletePhotoMutation() {
  const api = useDiaryApi()
  return useDiaryMutation((input: { entryId: string; photoId: string }) =>
    api.deletePhoto(input.entryId, input.photoId),
  )
}

export function useDeleteWineMutation() {
  const api = useDiaryApi()
  return useDiaryMutation((wineId: string) => api.deleteWine(wineId))
}

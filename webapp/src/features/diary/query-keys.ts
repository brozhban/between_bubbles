import type { WineListParams } from './api'
import { sessionQueryKeys } from '@/platform/query-keys'

/**
 * Всё содержимое дневника принадлежит сессии и живёт под её префиксом.
 *
 * Вне `['session', ...]` кэш переживал смену пользователя: на общем ноутбуке A выходил,
 * B входил, открывал неделю и до первого рефетча видел чужие записи, вина и цены как свои —
 * `QueryClient` один на приложение, а выход чистил только `['session']`.
 */
export const diaryKeys = {
  all: [...sessionQueryKeys.all, 'diary'] as const,
  week: (date?: string) => [...diaryKeys.all, 'week', date ?? 'current'] as const,
  entry: (entryId: string) => [...diaryKeys.all, 'entry', entryId] as const,
  trash: () => [...diaryKeys.all, 'trash'] as const,
  wines: (params: WineListParams) => [...diaryKeys.all, 'wines', params] as const,
  wine: (wineId: string) => [...diaryKeys.all, 'wine', wineId] as const,
  aromaTags: () => [...diaryKeys.all, 'aroma-tags'] as const,
  share: (entryId: string) => [...diaryKeys.all, 'share', entryId] as const,
  stats: (period: string) => [...diaryKeys.all, 'stats', period] as const,
  stores: (query: string, country?: string) =>
    [...diaryKeys.all, 'stores', query, country] as const,
}

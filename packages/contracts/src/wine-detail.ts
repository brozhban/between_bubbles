import { z } from 'zod'

import { entryListItemSchema } from './entry'
import { wineSchema } from './wine'

/**
 * Карточка вина (ТЗ §10.7). Живёт отдельным файлом, потому что связывает вино и записи,
 * а `entry.ts` уже зависит от `wine.ts` — обратная ссылка сделала бы импорты циклическими.
 */
export const wineDetailResponseSchema = z.object({
  wine: wineSchema,
  /** Средний рейтинг по всем дегустациям именно этого вина; null — если дегустаций нет. */
  averageRating: z.number().nullable(),
  tastings: z.array(entryListItemSchema),
})

export type WineDetailResponse = z.infer<typeof wineDetailResponseSchema>

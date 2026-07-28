import { z } from 'zod'

/**
 * Публикация карточки записи (ТЗ §12).
 *
 * Делится одна запись, а не дневник и не неделя. Ссылка неугадываемая, отзывается в любой
 * момент, и в публикацию не попадают цена, магазин, почта и любые другие записи — состав
 * публичных данных закреплён в `sharedEntrySchema`, а не собирается по месту.
 */

export const shareLinkSchema = z.object({
  slug: z.string(),
  /** Полный адрес страницы: собирает сервер, потому что домен знает только он. */
  url: z.string(),
  /** По умолчанию выключено (ТЗ §12). */
  showName: z.boolean(),
  createdAt: z.string().datetime(),
})

/** null — записью ещё не делились либо ссылку отозвали. */
export const shareLinkResponseSchema = z.object({ share: shareLinkSchema.nullable() })

export const shareCreateSchema = z.object({
  showName: z.boolean().optional().default(false),
})

export const shareUpdateSchema = z.object({
  showName: z.boolean(),
})

export type ShareLinkDto = z.infer<typeof shareLinkSchema>
export type ShareLinkResponse = z.infer<typeof shareLinkResponseSchema>
export type ShareCreatePayload = z.output<typeof shareCreateSchema>
export type ShareUpdatePayload = z.output<typeof shareUpdateSchema>

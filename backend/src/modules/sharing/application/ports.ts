import type { EntryDto, Locale } from '@between-bubbles/contracts'

/**
 * Порты публикации (ТЗ §12).
 *
 * Модуль владеет только ссылками. Саму запись он берёт у дневника, а фото — уже подписанными
 * ссылками оттуда же: знать про хранилище и про то, как считается неделя, публикации незачем.
 */

export type ShareLinkRecord = {
  slug: string
  entryId: string
  userId: string
  showName: boolean
  createdAt: Date
}

export type ShareRepository = {
  /** Действующая ссылка записи владельца. Отозванная не возвращается — она уже не ссылка. */
  findForEntry(input: { userId: string; entryId: string }): Promise<ShareLinkRecord | null>
  findActiveBySlug(slug: string): Promise<ShareLinkRecord | null>
  /** Проверка владения делается здесь же: чужой entryId просто не найдётся (ТЗ §2). */
  create(input: {
    userId: string
    entryId: string
    slug: string
    showName: boolean
  }): Promise<ShareLinkRecord | null>
  updateShowName(input: {
    userId: string
    entryId: string
    showName: boolean
  }): Promise<ShareLinkRecord | null>
  revoke(input: { userId: string; entryId: string; now: Date }): Promise<boolean>
}

/** Автор записи: имя показывается только по явному согласию, язык задаёт язык страницы. */
export type SharedAuthor = {
  displayName: string | null
  locale: Locale
}

export type AuthorReader = {
  findAuthor(userId: string): Promise<SharedAuthor | null>
}

/**
 * Чтение записи для публикации. Дневник отдаёт своё обычное DTO, а решение о том, что из
 * него попадёт наружу, принимает публикация — так состав публичных полей остаётся в одном месте.
 */
export type SharedEntryReader = {
  findEntry(input: { userId: string; entryId: string }): Promise<EntryDto | null>
}

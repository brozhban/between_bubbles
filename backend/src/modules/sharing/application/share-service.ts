import type { EntryDto, ShareLinkDto } from '@between-bubbles/contracts'

import { ShareFailure } from '../domain/errors'
import { renderMissingSharePage, renderSharedEntryPage, type SharedEntry } from '../domain/public-page'
import { createShareSlug } from '../domain/slug'
import type { AuthorReader, ShareLinkRecord, ShareRepository, SharedEntryReader } from './ports'

type ShareServiceDependencies = {
  repository: ShareRepository
  entries: SharedEntryReader
  authors: AuthorReader
  /** Адрес страницы собирает сервер: домен знает только он. */
  publicBaseUrl: string
  clock: { now(): Date }
}

export class ShareService {
  constructor(private readonly deps: ShareServiceDependencies) {}

  async getLink(input: { userId: string; entryId: string }): Promise<ShareLinkDto | null> {
    const link = await this.deps.repository.findForEntry(input)
    return link === null ? null : this.toDto(link)
  }

  /**
   * Повторное «Поделиться» отдаёт ту же ссылку, а не плодит новую: человек ожидает один
   * адрес на запись, и уже разосланные ссылки не должны молча превращаться в мёртвые.
   */
  async createLink(input: {
    userId: string
    entryId: string
    showName: boolean
  }): Promise<ShareLinkDto> {
    const existing = await this.deps.repository.findForEntry(input)
    if (existing) {
      if (existing.showName === input.showName) return this.toDto(existing)
      return this.updateLink(input)
    }

    const created = await this.deps.repository.create({
      ...input,
      slug: createShareSlug(),
    })
    if (!created) throw new ShareFailure('not_found', 'Entry not found')

    return this.toDto(created)
  }

  async updateLink(input: {
    userId: string
    entryId: string
    showName: boolean
  }): Promise<ShareLinkDto> {
    const updated = await this.deps.repository.updateShowName(input)
    if (!updated) throw new ShareFailure('not_found', 'Share link not found')

    return this.toDto(updated)
  }

  async revokeLink(input: { userId: string; entryId: string }): Promise<void> {
    const revoked = await this.deps.repository.revoke({ ...input, now: this.deps.clock.now() })
    if (!revoked) throw new ShareFailure('not_found', 'Share link not found')
  }

  /**
   * Публичная страница. Отозванная ссылка и несуществующая отвечают одинаково: по ответу
   * нельзя понять, была ли здесь запись вообще.
   */
  async renderPage(slug: string): Promise<{ html: string; status: 200 | 404 }> {
    const link = await this.deps.repository.findActiveBySlug(slug)
    if (!link) return { html: renderMissingSharePage('ru'), status: 404 }

    // Последовательно, а не через Promise.all: драйвер pg не выполняет параллельные запросы
    // на одном соединении.
    const entry = await this.deps.entries.findEntry({
      userId: link.userId,
      entryId: link.entryId,
    })
    const author = await this.deps.authors.findAuthor(link.userId)
    // Запись могла уехать в корзину уже после того, как ссылку разослали.
    if (!entry || entry.deletedAt !== null || !author) {
      return { html: renderMissingSharePage('ru'), status: 404 }
    }

    const shared = toSharedEntry({ entry, link, author })
    return {
      html: renderSharedEntryPage(shared, this.pageUrl(link.slug)),
      status: 200,
    }
  }

  private toDto(link: ShareLinkRecord): ShareLinkDto {
    return {
      slug: link.slug,
      url: this.pageUrl(link.slug),
      showName: link.showName,
      createdAt: link.createdAt.toISOString(),
    }
  }

  private pageUrl(slug: string): string {
    return `${this.deps.publicBaseUrl.replace(/\/$/, '')}/w/${slug}`
  }
}

/**
 * Единственное место, где решается, что уезжает в публикацию (ТЗ §12).
 *
 * Цена, магазин, страна покупки, объём и все прочие поля записи сюда не переносятся
 * намеренно: публикация — это впечатление от вина, а не выписка о покупке.
 */
function toSharedEntry(input: {
  entry: EntryDto
  link: ShareLinkRecord
  author: { displayName: string | null; locale: SharedEntry['locale'] }
}): SharedEntry {
  const { entry, link, author } = input

  return {
    slug: link.slug,
    tastedOn: entry.tastedOn,
    wineName: entry.wine.name,
    wineType: entry.wine.type,
    producer: entry.wine.producer,
    region: entry.wine.region,
    originCountryName: countryName(entry.wine.originCountry, author.locale),
    grapes: entry.wine.grapes,
    vintage: entry.wine.vintage,
    sugar: entry.wine.sugar,
    rating: entry.rating,
    tasteCategory: entry.tasteCategory,
    aftertaste: entry.aftertaste,
    notes: entry.notes,
    photos: entry.photos.map((photo) => ({ url: photo.url, thumbUrl: photo.thumbUrl })),
    authorName: link.showName ? author.displayName : null,
    locale: author.locale,
  }
}

/** Названия стран строит `Intl.DisplayNames` — таблицы в репозитории нет (ТЗ §5.1). */
function countryName(code: string | null, locale: SharedEntry['locale']): string | null {
  if (!code) return null

  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code
  } catch {
    return code
  }
}

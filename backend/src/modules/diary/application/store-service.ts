import type { StoreCreatePayload, StoreSearchQuery, StoreSearchResponse } from '@between-bubbles/contracts'

import { DiaryFailure } from '../domain/errors'
import {
  findDuplicate,
  looksLikeSpam,
  normalizeStoreName,
  STORE_CREATION_DAILY_LIMIT,
} from '../domain/store-matching'
import type { Clock, StoreRepository } from './ports'

/** Сколько магазинов страны просматривать в поиске дубля. */
const DUPLICATE_CANDIDATE_LIMIT = 200

type StoreServiceDependencies = {
  clock: Clock
  repository: StoreRepository
}

/** Общий справочник магазинов: пополняется без премодерации, но с тремя слоями защиты (ТЗ §5.2). */
export class StoreService {
  constructor(private readonly deps: StoreServiceDependencies) {}

  /**
   * Автодополнение: сначала личные недавние магазины, затем совпадения по стране покупки
   * и `usageCount`. Отдельно возвращается кандидат на дубль для подсказки перед созданием.
   */
  async search(userId: string, query: StoreSearchQuery): Promise<StoreSearchResponse> {
    const recent = await this.deps.repository.listRecentForUser({ userId, limit: query.limit })
    const matches = await this.deps.repository.search({
      query: query.q,
      countryCode: query.country,
      limit: query.limit,
    })

    return {
      recent,
      matches,
      duplicateSuggestion: query.q ? await this.findSimilar(query.q, query.country) : null,
    }
  }

  /**
   * Нечёткий поиск идёт по отдельной выборке, а не по результатам подстрочного поиска:
   * опечатка по определению туда не попадает, а ловить надо именно её (ТЗ §5.2, слой 1).
   */
  private async findSimilar(name: string, countryCode?: string) {
    const candidates = await this.deps.repository.listForDuplicateCheck({
      countryCode,
      limit: DUPLICATE_CANDIDATE_LIMIT,
    })

    return findDuplicate(name, candidates)
  }

  async create(userId: string, payload: StoreCreatePayload) {
    const normalizedName = normalizeStoreName(payload.name)

    if (looksLikeSpam(payload.name) || normalizedName.length < 2) {
      throw new DiaryFailure('invalid_input', 'Store name is not acceptable')
    }

    const dayAgo = new Date(this.deps.clock.now().getTime() - 24 * 60 * 60 * 1000)
    const createdToday = await this.deps.repository.countCreatedSince({ userId, since: dayAgo })
    if (createdToday >= STORE_CREATION_DAILY_LIMIT) {
      throw new DiaryFailure('store_quota_exceeded', 'Daily store creation limit reached')
    }

    return this.deps.repository.create({
      userId,
      name: payload.name,
      normalizedName,
      countryCode: payload.countryCode,
      city: payload.city,
      kind: payload.kind,
    })
  }

  /** Магазин из формы записи: либо уже выбранный id, либо новый в справочнике. */
  async resolve(
    userId: string,
    store:
      | { mode: 'existing'; storeId: string }
      | {
          mode: 'new'
          name: string
          countryCode: string
          city?: string
          kind?: StoreCreatePayload['kind']
        },
  ): Promise<string> {
    if (store.mode === 'existing') {
      const existing = await this.deps.repository.findById({ storeId: store.storeId })
      if (!existing) throw new DiaryFailure('not_found', 'Store not found')
      return existing.id
    }

    const created = await this.create(userId, {
      name: store.name,
      countryCode: store.countryCode,
      city: store.city,
      kind: store.kind ?? 'OTHER',
    })

    return created.id
  }
}

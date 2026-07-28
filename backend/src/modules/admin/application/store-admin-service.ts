import type { AdminStoreDto, AdminStoreListQuery } from '@between-bubbles/contracts'

import { AdminFailure } from '../domain/errors'
import type { AdminStoreRepository } from './ports'

/** Постмодерация справочника магазинов (ТЗ §5.2 п.3). */
export class StoreAdminService {
  constructor(private readonly repository: AdminStoreRepository) {}

  list(query: AdminStoreListQuery): Promise<AdminStoreDto[]> {
    return this.repository.list(query)
  }

  async merge(input: { sourceId: string; targetId: string }): Promise<AdminStoreDto> {
    if (input.sourceId === input.targetId) {
      throw new AdminFailure('invalid_merge', 'A store cannot be merged into itself')
    }

    const target = await this.repository.findById(input.targetId)
    if (!target) throw new AdminFailure('not_found', 'Target store not found')
    // Слияние в уже слитый дубль превратило бы цепочку в лабиринт: записи ушли бы на строку,
    // которая сама никуда не предлагается.
    if (target.status !== 'ACTIVE') {
      throw new AdminFailure('invalid_merge', 'Target store must be active')
    }

    const merged = await this.repository.merge(input)
    if (!merged) throw new AdminFailure('not_found', 'Store not found')

    return merged
  }

  async setStatus(input: {
    storeId: string
    status: 'ACTIVE' | 'HIDDEN'
  }): Promise<AdminStoreDto> {
    const updated = await this.repository.setStatus(input)
    if (!updated) throw new AdminFailure('not_found', 'Store not found')

    return updated
  }
}

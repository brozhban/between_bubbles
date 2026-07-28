import type { AdminStoreDto, AdminStoreListQuery } from '@between-bubbles/contracts'

/**
 * Порт админки справочника. Пользовательских сущностей здесь нет: администратор работает
 * только с общими магазинами (ТЗ §2).
 */
export type AdminStoreRepository = {
  list(query: AdminStoreListQuery): Promise<AdminStoreDto[]>
  findById(storeId: string): Promise<AdminStoreDto | null>
  /**
   * Слияние дубля в мастер: записи и личные списки перецепляются, счётчик использований
   * складывается, дубль остаётся строкой со статусом `MERGED` и ссылкой на мастер (ТЗ §5.2).
   */
  merge(input: { sourceId: string; targetId: string }): Promise<AdminStoreDto | null>
  setStatus(input: { storeId: string; status: 'ACTIVE' | 'HIDDEN' }): Promise<AdminStoreDto | null>
}

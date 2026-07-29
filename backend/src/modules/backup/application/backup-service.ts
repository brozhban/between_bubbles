import { gunzipSync, gzipSync } from 'node:zlib'

import type { DbClient } from '../../../db'
import {
  BACKUP_TABLES,
  backupKey,
  isExpiredBackupKey,
  type BackupTable,
} from '../domain/tables'

/**
 * Хранилище копий. Отдельный порт, а не готовый `StorageService`: тому нужны подписанные
 * ссылки и публичные адреса, а копиям — только положить, перечислить и удалить.
 */
export type BackupStorage = {
  put(input: { key: string; bytes: Uint8Array }): Promise<void>
  get(key: string): Promise<Uint8Array>
  list(prefix: string): Promise<string[]>
  delete(key: string): Promise<void>
}

type BackupServiceDependencies = {
  db: DbClient
  storage: BackupStorage
  clock: { now(): Date }
}

export class BackupService {
  constructor(private readonly deps: BackupServiceDependencies) {}

  /**
   * Снимок всех таблиц одним файлом.
   *
   * Данные читаются через `json_agg` на стороне PostgreSQL, а не через Prisma: так типы
   * (uuid, decimal, массивы, перечисления, даты) сериализуются самой базой ровно так, как
   * она же их потом и прочитает. Обратный путь — `json_populate_recordset`, поэтому ни одна
   * конвертация не делается вручную и не может разъехаться.
   */
  async create(): Promise<{ key: string; sizeBytes: number; rows: Record<string, number> }> {
    const rows: Record<string, number> = {}
    const tables: Record<string, unknown[]> = {}

    for (const table of BACKUP_TABLES) {
      const data = await this.readTable(table)
      tables[table] = data
      rows[table] = data.length
    }

    const payload = {
      createdAt: this.deps.clock.now().toISOString(),
      // Версия формата: если состав таблиц поменяется, старые копии останутся читаемыми.
      version: 1,
      tables,
    }
    const bytes = gzipSync(Buffer.from(JSON.stringify(payload), 'utf8'))
    const key = backupKey(this.deps.clock.now())

    await this.deps.storage.put({ key, bytes })

    return { key, sizeBytes: bytes.byteLength, rows }
  }

  /**
   * Восстановление в пустую базу со схемой из миграций.
   *
   * Существующие строки не трогаются: восстановление поверх живых данных — это отдельная
   * операция со своими правилами разрешения конфликтов, и делать её молча нельзя.
   */
  async restore(key: string): Promise<Record<string, number>> {
    const payload = JSON.parse(gunzipSync(await this.deps.storage.get(key)).toString('utf8')) as {
      tables: Record<string, unknown[]>
    }
    const restored: Record<string, number> = {}

    for (const table of BACKUP_TABLES) {
      const data = payload.tables[table] ?? []
      if (data.length === 0) {
        restored[table] = 0
        continue
      }

      await this.deps.db.$executeRawUnsafe(
        `INSERT INTO "${table}" SELECT * FROM json_populate_recordset(NULL::"${table}", $1::json)`,
        JSON.stringify(data),
      )
      restored[table] = data.length
    }

    return restored
  }

  /** Чистка старых копий: срок хранения — 30 дней (ТЗ §13). */
  async prune(): Promise<number> {
    const now = this.deps.clock.now()
    const keys = await this.deps.storage.list('backups/')
    const expired = keys.filter((key) => isExpiredBackupKey(key, now))

    for (const key of expired) {
      await this.deps.storage.delete(key)
    }

    return expired.length
  }

  private async readTable(table: BackupTable): Promise<unknown[]> {
    const result = await this.deps.db.$queryRawUnsafe<Array<{ data: unknown[] }>>(
      `SELECT coalesce(json_agg(t), '[]'::json) AS data FROM "${table}" t`,
    )

    return result[0]?.data ?? []
  }
}

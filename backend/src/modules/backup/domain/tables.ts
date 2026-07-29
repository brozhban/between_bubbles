/**
 * Логическая копия базы (ТЗ §13).
 *
 * Managed PostgreSQL и так делает суточные снимки, но они живут внутри той же учётной записи
 * DigitalOcean: потеря доступа к аккаунту или ошибочное удаление кластера уносит их вместе
 * с базой. Эта копия лежит в объектном хранилище отдельно и переживает такие случаи.
 *
 * Формат — JSON по таблице, без схемы: схему восстанавливает Prisma из миграций, которые
 * лежат в git. Дублировать её в дампе значило бы получить два источника правды.
 */

/**
 * Порядок важен: при восстановлении строки вставляются как есть, и ссылки должны находить
 * своих владельцев. Записи ссылаются на неделю, вино и магазин, фото — на запись, и так далее.
 */
export const BACKUP_TABLES = [
  'users',
  'aroma_tags',
  'stores',
  'weeks',
  'wines',
  'tasting_entries',
  'entry_aromas',
  'entry_photos',
  'user_store_recents',
  'share_links',
  'auth_tokens',
  'auth_sessions',
] as const

export type BackupTable = (typeof BACKUP_TABLES)[number]

/** Копии старше этого срока удаляются: держать их вечно дорого и незачем (ТЗ §13). */
export const BACKUP_RETENTION_DAYS = 30

export const BACKUP_PREFIX = 'backups/'

export function backupKey(now: Date): string {
  return `${BACKUP_PREFIX}db-${now.toISOString().slice(0, 19).replaceAll(':', '-')}Z.json.gz`
}

/** Ключ старше срока хранения — по дате в самом имени, а не по метаданным хранилища. */
export function isExpiredBackupKey(key: string, now: Date): boolean {
  const match = /db-(\d{4}-\d{2}-\d{2})T/.exec(key)
  if (!match) return false

  const created = new Date(`${match[1]}T00:00:00.000Z`).getTime()
  return now.getTime() - created > BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000
}

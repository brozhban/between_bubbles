import type { DbClient } from '../../db'
import type { AppEnv } from '../../env'
import { BackupService } from './application/backup-service'
import { createSpacesBackupStorage } from './infrastructure/backup-storage'

type CreateBackupModuleOptions = {
  db: DbClient
  env: AppEnv
  clock?: { now(): Date }
}

const systemClock = { now: () => new Date() }

/**
 * Логические копии базы (ТЗ §13). Возвращает null без настроенного хранилища: локальной
 * разработке копии не нужны, а падать из-за их отсутствия — лишний повод не запуститься.
 */
export function createBackupModule({
  db,
  env,
  clock = systemClock,
}: CreateBackupModuleOptions): BackupService | null {
  const storage = createSpacesBackupStorage(env)
  if (!storage) return null

  return new BackupService({ db, storage, clock })
}

export { BackupService } from './application/backup-service'
export type { BackupStorage } from './application/backup-service'
export { BACKUP_RETENTION_DAYS, BACKUP_TABLES } from './domain/tables'

import { createBackupModule } from './modules/backup'
import { purgeExpiredTrash, seedSystemAromaTags } from './modules/diary'
import { deletePhotoFiles, deleteUserPhotoFiles } from './modules/photos'
import { createBackendRuntime, type BackendRuntime } from './runtime'

type CronTask = (runtime: BackendRuntime, now: Date) => Promise<void>

const DAY_MS = 24 * 60 * 60 * 1000

/** Корзина и удалённые аккаунты чистятся через 30 дней (ТЗ §7.6, §14). */
const RETENTION_DAYS = 30

const cronTasks = {
  noop: async () => {
    console.log('Cron noop task completed.')
  },
  'db:ping': async ({ prisma }) => {
    await prisma.$queryRaw`SELECT 1`
    console.log('Cron db:ping task completed.')
  },
  'auth:sessions:cleanup': async ({ env, prisma }, now) => {
    const dayMs = 24 * 60 * 60 * 1000
    const retentionCutoff = new Date(
      now.getTime() - env.SESSION_RETENTION_DAYS * dayMs,
    )
    const absoluteRetentionCutoff = new Date(
      now.getTime() - (env.SESSION_ABSOLUTE_TTL_DAYS + env.SESSION_RETENTION_DAYS) * dayMs,
    )
    const { count } = await prisma.authSession.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: retentionCutoff } },
          { revokedAt: { lt: retentionCutoff } },
          { createdAt: { lt: absoluteRetentionCutoff } },
        ],
      },
    })
    console.log(`Cron auth:sessions:cleanup removed ${count} stale sessions.`)
  },
  'diary:trash:purge': async ({ env, prisma }, now) => {
    const cutoff = new Date(now.getTime() - RETENTION_DAYS * DAY_MS)
    // Через модуль дневника, а не сырым deleteMany: каскад унесёт строки фото, но не файлы
    // в хранилище, и пустые недели остались бы висеть (ТЗ §7.6).
    const { purgedEntries, photos } = await purgeExpiredTrash({ db: prisma, before: cutoff })
    const removedFiles = await deletePhotoFiles({ env, photos })
    console.log(
      `Cron diary:trash:purge removed ${purgedEntries} entries and ${removedFiles} photo files deleted before ${cutoff.toISOString()}.`,
    )
  },
  'accounts:purge': async ({ env, prisma }, now) => {
    const cutoff = new Date(now.getTime() - RETENTION_DAYS * DAY_MS)
    const expired = await prisma.user.findMany({
      where: { deletedAt: { not: null, lt: cutoff } },
      select: { id: true },
    })
    if (expired.length === 0) {
      console.log('Cron accounts:purge found no accounts past the retention window.')
      return
    }

    const userIds = expired.map((user) => user.id)
    // Файлы фото удаляем до строк: каскад снесёт EntryPhoto, но не объекты в хранилище (ТЗ §14).
    const removedFiles = await deleteUserPhotoFiles({ db: prisma, env, userIds })
    // Магазины остаются в общем справочнике, но обезличиваются (ТЗ §14).
    await prisma.store.updateMany({
      where: { createdByUserId: { in: userIds } },
      data: { createdByUserId: null },
    })
    const { count } = await prisma.user.deleteMany({ where: { id: { in: userIds } } })
    console.log(
      `Cron accounts:purge removed ${count} accounts and ${removedFiles} photo files before ${cutoff.toISOString()}.`,
    )
  },
  /**
   * Логическая копия базы в объектное хранилище (ТЗ §13). Суточные снимки Managed PostgreSQL
   * живут в той же учётной записи, что и сама база; эта копия лежит отдельно и переживает
   * потерю доступа к аккаунту или ошибочное удаление кластера.
   */
  'db:backup': async ({ env, prisma }) => {
    const backups = createBackupModule({ db: prisma, env })
    if (!backups) {
      // Раньше здесь было предупреждение и успешный выход: задача «отработала», копии не
      // было, и узнать об этом можно было только чтением логов. README подаёт эту копию как
      // страховку от потери учётной записи провайдера — молчаливое отсутствие страховки
      // хуже, чем её отсутствие с ошибкой. Локально задачу просто не запускают.
      throw new Error(
        'Cron db:backup requires object storage: set the SPACES_* group for this component.',
      )
    }

    const { key, sizeBytes, rows } = await backups.create()
    const removed = await backups.prune()
    const total = Object.values(rows).reduce((sum, count) => sum + count, 0)

    console.log(
      `Cron db:backup wrote ${key} (${sizeBytes} bytes, ${total} rows) and removed ${removed} expired copies.`,
    )
  },
  'diary:aroma-tags:seed': async ({ prisma }) => {
    const created = await seedSystemAromaTags(prisma)
    console.log(`Cron diary:aroma-tags:seed created ${created} system aroma tags.`)
  },
} satisfies Record<string, CronTask>

export type CronTaskName = keyof typeof cronTasks

export async function runCronTask(
  taskName: string,
  runtime: BackendRuntime,
  now = new Date(),
) {
  const task = cronTasks[taskName as CronTaskName]

  if (!task) {
    throw new Error(`Unknown cron task "${taskName}". Available tasks: ${Object.keys(cronTasks).join(', ')}`)
  }

  await task(runtime, now)
}

export async function main(argv: string[] = Bun.argv.slice(2)) {
  const [taskName] = argv

  if (!taskName) {
    console.error(`Cron task name is required. Available tasks: ${Object.keys(cronTasks).join(', ')}`)
    process.exit(1)
  }

  const runtime = createBackendRuntime()

  try {
    await runCronTask(taskName, runtime)
  } finally {
    await runtime.close()
  }
}

if (import.meta.main) {
  await main()
}

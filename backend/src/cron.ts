import { seedSystemAromaTags } from './modules/diary'
import { deleteUserPhotoFiles } from './modules/photos'
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
  'diary:trash:purge': async ({ prisma }, now) => {
    const cutoff = new Date(now.getTime() - RETENTION_DAYS * DAY_MS)
    const { count } = await prisma.tastingEntry.deleteMany({
      where: { deletedAt: { not: null, lt: cutoff } },
    })
    console.log(`Cron diary:trash:purge removed ${count} entries deleted before ${cutoff.toISOString()}.`)
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

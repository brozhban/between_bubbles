/**
 * Кто здесь администратор (ТЗ §2).
 *
 * Список почт в переменной окружения, а не роль в базе: администраторов у продукта единицы,
 * назначает их тот же человек, что выкатывает релиз, а обратимость важнее гибкости — убрать
 * почту из списка можно за одну правку конфига, без миграции и без строк, которые потом
 * придётся чистить. Когда админов станет много и назначать их будут из интерфейса, роль
 * переедет в базу отдельной миграцией; на этот случай проверка живёт ровно в одном месте.
 */
export type AdminRoster = {
  includes(email: string): boolean
}

export function createAdminRoster(rawEmails: string | undefined): AdminRoster {
  const emails = new Set(
    (rawEmails ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email.length > 0),
  )

  return {
    // Почта в базе хранится уже приведённой к нижнему регистру, но список пишет человек.
    includes: (email) => emails.has(email.trim().toLowerCase()),
  }
}

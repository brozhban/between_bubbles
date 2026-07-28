import { expect, registerUser, tastingDate, test, uniqueEmail } from '../helpers/test'

/**
 * Админка справочника магазинов (ТЗ §5.2 п.3, §10.12).
 *
 * Администратор задаётся списком почт в конфиге бэкенда (см. `playwright.config.ts`),
 * поэтому этот адрес фиксирован, а не случайный, как у остальных сценариев.
 */
const adminEmail = 'e2e-admin@example.com'

/** Заводит запись вместе с новым магазином — так магазины и попадают в общий справочник. */
async function addEntryWithStore(
  page: import('@playwright/test').Page,
  options: { wineName: string; storeName: string },
) {
  await page.getByRole('link', { name: 'Добавить' }).click()
  await page.getByLabel('Дата дегустации').fill(tastingDate())
  await page.getByLabel('Название').fill(options.wineName)
  await page.getByLabel('Страна покупки').selectOption('GE')
  await page.getByLabel('Магазин').fill(options.storeName)
  await page.getByRole('button', { name: 'Нет в списке — добавить' }).click()
  // Магазин попадает в запись только после подтверждения — иначе это просто текст в поле.
  await page.getByRole('button', { name: 'Создать магазин' }).click()
  await expect(page.getByRole('button', { name: 'Магазин будет создан' })).toBeVisible()
  await page.getByRole('button', { name: 'К оценке' }).click()
  await page.getByRole('slider', { name: 'Оценка' }).fill('4')
  await page.getByRole('button', { name: 'Сохранить запись' }).click()
  await expect(page.getByText(/Неделя \d+ · \d{4}/)).toBeVisible()
}

test('обычный пользователь не видит админку и не попадает в неё по адресу', async ({ page }) => {
  await registerUser(page, uniqueEmail('e2e-not-admin'), 'E2E User')

  await page.getByRole('link', { name: 'Профиль' }).click()
  await expect(page.getByText('Справочник магазинов')).toHaveCount(0)

  await page.goto('/admin/stores')
  await expect(page.getByText('Этот раздел доступен только администратору')).toBeVisible()
})

test('администратор прячет мусорный магазин из подсказок (ТЗ §5.2)', async ({ page }) => {
  await registerUser(page, adminEmail, 'E2E Admin')
  await addEntryWithStore(page, { wineName: 'Admin Wine', storeName: 'Мусорный магазин' })

  // Напоминание о неподтверждённой почте тоже прячется кнопкой «Скрыть» — убираем его,
  // чтобы дальше эта подпись означала ровно одно действие.
  await page.getByRole('button', { name: 'Скрыть' }).click()

  await page.getByRole('link', { name: 'Профиль' }).click()
  await page.getByRole('button', { name: 'Справочник магазинов' }).click()

  await expect(page.getByText('Мусорный магазин')).toBeVisible()
  await page.getByRole('button', { name: 'Скрыть' }).click()

  // Скрытый магазин пропадает из активных и больше не подсказывается в форме записи.
  await expect(page.getByText('Мусорный магазин')).toHaveCount(0)

  await page.getByRole('link', { name: 'Добавить' }).click()
  await page.getByLabel('Страна покупки').selectOption('GE')
  await page.getByLabel('Магазин').fill('Мусорный')
  await expect(page.getByRole('button', { name: 'Мусорный магазин' })).toHaveCount(0)
})

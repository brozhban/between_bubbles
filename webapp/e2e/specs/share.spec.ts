import { expect, registerUser, tastingDate, test, uniqueEmail } from '../helpers/test'

/**
 * Публикация записи (ТЗ §12) целиком: ссылка создаётся в дневнике, открывается без сессии
 * и умирает по отзыву. Ниже E2E это не проверить — страницу отдаёт бэкенд другим origin,
 * а смотреть её должен человек без токена.
 */
test('публикация записи: ссылка открывается без входа и умирает по отзыву', async ({
  page,
  browser,
}) => {
  await registerUser(page, uniqueEmail('e2e-share'), 'Елена')

  await page.getByRole('link', { name: 'Добавить' }).click()
  await page.getByLabel('Дата дегустации').fill(tastingDate())
  await page.getByLabel('Название').fill('Share E2E Saperavi')
  await page.getByLabel('Цена за бутылку').fill('75')
  await page.getByRole('button', { name: 'К оценке' }).click()
  await page.getByRole('slider', { name: 'Оценка' }).fill('4.5')
  await page.getByRole('button', { name: 'Сохранить запись' }).click()
  await expect(page.getByText(/Неделя \d+ · \d{4}/)).toBeVisible()

  await page.locator('a[href*="/entries/"]').first().click()
  await page.getByRole('button', { name: 'Поделиться записью' }).click()

  const link = page.getByText(/\/w\//)
  await expect(link).toBeVisible()
  const url = (await link.textContent())?.trim() ?? ''
  expect(url).toMatch(/\/w\/[A-Za-z0-9_-]{16}$/)

  // Гость: отдельный контекст без cookie и без токена — как открытие ссылки из мессенджера.
  const guest = await browser.newContext()
  const guestPage = await guest.newPage()
  await guestPage.goto(url)

  await expect(guestPage.getByRole('heading', { name: 'Share E2E Saperavi' })).toBeVisible()
  await expect(guestPage.getByText('4.5')).toBeVisible()
  // Цена в публикацию не идёт (ТЗ §12), имя автора выключено по умолчанию.
  await expect(guestPage.getByText('75')).toHaveCount(0)
  await expect(guestPage.getByText('Елена')).toHaveCount(0)

  const showName = page.getByRole('switch', { name: 'Показывать моё имя' })
  await showName.click()
  // Ждём, пока настройка долетит до сервера: иначе гость перезагрузится раньше неё.
  await expect(showName).toBeChecked()
  await guestPage.reload()
  await expect(guestPage.getByText('Елена')).toBeVisible()

  await page.getByRole('button', { name: 'Отозвать ссылку' }).click()
  await expect(page.getByRole('button', { name: 'Поделиться записью' })).toBeVisible()

  await guestPage.reload()
  await expect(guestPage.getByText('Ссылка недоступна')).toBeVisible()
  await expect(guestPage.getByText('Share E2E Saperavi')).toHaveCount(0)

  await guest.close()
})

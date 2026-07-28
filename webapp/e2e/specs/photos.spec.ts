import type { Locator } from '@playwright/test'

import { expect, registerUser, tastingDate, tastingPhoto, test, uniqueEmail } from '../helpers/test'

/**
 * Картинка должна именно нарисоваться, а не просто оказаться в разметке: битый `<img>`
 * остаётся видимым элементом с альтернативным текстом, и проверка «элемент есть» его пропускает.
 * Так однажды и прошёл незамеченным заголовок `Cross-Origin-Resource-Policy`, из-за которого
 * браузер отказывался показывать фото с другого порта.
 */
async function expectRendered(image: Locator) {
  await expect
    .poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
    .toBeGreaterThan(0)
}

/**
 * Фото записи (ТЗ §11) целиком, от выбора файла до удаления.
 *
 * Проверять это ниже E2E нечем: снимок сжимается в браузере через canvas, уезжает уже после
 * создания записи и возвращается подписанной ссылкой с сервера — ни один из этих шагов
 * не виден ни юнит-тесту клиента, ни интеграционному тесту API.
 */
test('фото в форме → миниатюра в неделе → полный размер → удаление', async ({ page }) => {
  await registerUser(page, uniqueEmail('e2e-photo'), 'E2E Photo')

  await page.getByRole('link', { name: 'Добавить' }).click()
  await page.getByLabel('Дата дегустации').fill(tastingDate())
  await page.getByLabel('Название').fill('Photo E2E')
  await page.getByRole('button', { name: 'К оценке' }).click()
  await page.getByRole('slider', { name: 'Оценка' }).fill('4')

  // Фото новой записи ждёт в форме: загружать его некуда, пока у записи нет id.
  await page.locator('input[type="file"]').setInputFiles(tastingPhoto())
  await expect(page.getByRole('img', { name: 'Бутылка' })).toBeVisible()
  await expectRendered(page.getByRole('img', { name: 'Бутылка' }))

  await page.getByRole('button', { name: 'Сохранить запись' }).click()
  await expect(page.getByText(/Неделя \d+ · \d{4}/)).toBeVisible()

  // Миниатюра в строке недели (ТЗ §10.5) — значит фото долетело до хранилища вместе с записью.
  const entryLink = page.locator('a[href*="/entries/"]').first()
  await expect(entryLink.locator('img')).toHaveCount(1)
  await expectRendered(entryLink.locator('img'))

  await entryLink.click()
  const thumbnail = page.getByRole('img', { name: 'Бутылка' })
  await expect(thumbnail).toBeVisible()
  await expectRendered(thumbnail)

  // Полноразмерная версия раскрывается по тапу: у неё та же подпись, поэтому картинок две.
  await thumbnail.click()
  await expect(page.getByRole('img', { name: 'Бутылка' })).toHaveCount(2)
  await expectRendered(page.getByRole('img', { name: 'Бутылка' }).last())
  await page.getByRole('button', { name: 'Свернуть фото' }).click()
  await expect(page.getByRole('img', { name: 'Бутылка' })).toHaveCount(1)

  // «Удалить» есть и у записи, поэтому целимся именно в подпись под фото.
  await page.locator('figure').getByRole('button', { name: 'Удалить' }).click()
  await expect(page.getByRole('img', { name: 'Бутылка' })).toHaveCount(0)
})

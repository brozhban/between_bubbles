import { expect, registerUser, tastingDate, test, uniqueEmail } from '../helpers/test'

/**
 * Сценарии приёмки из ТЗ §13. Оба про деньги и метрики, то есть про то, где ошибка
 * тише всего и дороже всего: цифры просто окажутся другими, и никто не заметит.
 */

/** Заполняет форму записи и сохраняет её. Возвращается на экран недели. */
async function addEntry(
  page: import('@playwright/test').Page,
  options: {
    wineName: string
    type?: string
    rating: number
    volumeLabel?: string
    price?: string
    sameBottleOf?: string
    existingWine?: string
  },
) {
  await page.getByRole('link', { name: 'Добавить' }).click()
  await expect(page.getByText('Шаг 1 из 4 · Основное')).toBeVisible()

  await page.getByLabel('Дата дегустации').fill(tastingDate())

  if (options.existingWine) {
    await page.getByRole('button', { name: 'Уже пробовал' }).click()
    await page.getByLabel('Из моего справочника').selectOption({ label: options.existingWine })
  } else {
    await page.getByLabel('Название').fill(options.wineName)
    if (options.type) {
      await page.getByLabel('Тип', { exact: true }).selectOption(options.type)
    }
  }

  if (options.volumeLabel) {
    await page.getByRole('button', { name: options.volumeLabel, exact: true }).click()
  }

  if (options.price) {
    await page.getByLabel('Цена за бутылку').fill(options.price)
  }

  if (options.sameBottleOf) {
    // Подпись опции содержит ещё и дату, поэтому выбираем по значению найденной опции,
    // а не по точному тексту.
    const bottles = page.getByLabel('Та же бутылка')
    const value = await bottles
      .locator('option', { hasText: options.sameBottleOf })
      .first()
      .getAttribute('value')
    await bottles.selectOption(value ?? '')
  }

  await page.getByRole('button', { name: 'К оценке' }).click()
  await expect(page.getByText('Шаг 4 из 4 · Оценка и заметки')).toBeVisible()

  await page.getByRole('slider', { name: 'Оценка' }).fill(String(options.rating))
  await page.getByRole('button', { name: 'Сохранить запись' }).click()

  await expect(page.getByText(/Неделя \d+ · \d{4}/)).toBeVisible()
}

test('регистрация → первая запись → метрики недели', async ({ page }) => {
  await registerUser(page, uniqueEmail('e2e-week'), 'E2E Week')

  // Пустая неделя: метрик нет, есть приглашение добавить вино (ТЗ §6).
  await expect(page.getByText('На этой неделе записей нет')).toBeVisible()
  await expect(page.getByText('Всего вин')).toHaveCount(0)

  await addEntry(page, {
    wineName: 'Saperavi E2E',
    type: 'RED',
    rating: 4.5,
    volumeLabel: '🍷🍷',
  })

  // Метрики появились и посчитаны: 300 мл — это 2 бокала по 150 (ТЗ §7.2, §8.1).
  await expect(page.getByText('Всего вин')).toBeVisible()
  const metrics = page.locator('section').filter({ hasText: 'Всего вин' }).first()
  await expect(metrics.getByText('300')).toBeVisible()
  await expect(metrics.getByText('2', { exact: true })).toBeVisible()

  await expect(page.getByText('Топовое вино')).toBeVisible()
  await expect(page.getByText('Saperavi E2E').first()).toBeVisible()
  await expect(page.getByText('4.5').first()).toBeVisible()

  await expect(page.getByText('На этой неделе записей нет')).toHaveCount(0)
})

test('повтор вина → та же бутылка → траты не задвоились', async ({ page }) => {
  await registerUser(page, uniqueEmail('e2e-bottle'), 'E2E Bottle')

  // Траты показываются только по явному согласию пользователя (ТЗ §8.1).
  await page.getByRole('link', { name: 'Профиль' }).click()
  await page.getByRole('switch').click()
  await page.getByRole('button', { name: 'Сохранить настройки' }).click()
  await expect(page.getByText('Настройки сохранены.')).toBeVisible()

  await page.getByRole('link', { name: 'Неделя' }).click()
  await addEntry(page, {
    wineName: 'Rkatsiteli E2E',
    type: 'ORANGE',
    rating: 4,
    volumeLabel: '🍷🍷🍷',
    price: '60',
  })

  const spend = page.locator('section').filter({ hasText: 'Траты' }).first()
  await expect(spend.getByText('60 ₾')).toBeVisible()

  // Допиваем ту же бутылку: вино берём из справочника и помечаем как ту же бутылку.
  await addEntry(page, {
    wineName: 'Rkatsiteli E2E',
    existingWine: 'Rkatsiteli E2E · оранж',
    rating: 4.5,
    volumeLabel: '🍷🍷',
    sameBottleOf: 'Rkatsiteli E2E',
  })

  // Записей стало две, объём вырос — а траты остались прежними (ТЗ §7.4).
  const metrics = page.locator('section').filter({ hasText: 'Всего вин' }).first()
  await expect(metrics.getByText('750')).toBeVisible()
  await expect(spend.getByText('60 ₾')).toBeVisible()
  await expect(spend.getByText('120 ₾')).toHaveCount(0)

  // В списке недели повтор помечен явно, чтобы цена не читалась как новая трата.
  await expect(page.getByText(/та же бутылка/)).toBeVisible()
})

test('статистика за период считает вина, бокалы и топ вин (ТЗ §10.9)', async ({ page }) => {
  await registerUser(page, uniqueEmail('e2e-stats'), 'E2E Stats')
  await addEntry(page, { wineName: 'Stats Saperavi', type: 'RED', rating: 5, volumeLabel: '🍷🍷' })
  await addEntry(page, { wineName: 'Stats Rkatsiteli', type: 'WHITE', rating: 3.5 })

  await page.getByRole('button', { name: 'Статистика' }).click()
  await expect(page.getByRole('heading', { name: 'Статистика' })).toBeVisible()

  // Две записи, 300 + 150 мл = три бокала.
  const totals = page.locator('section').filter({ hasText: 'Всего вин' }).first()
  await expect(totals.getByText('2', { exact: true })).toBeVisible()
  await expect(totals.getByText('3', { exact: true })).toBeVisible()
  await expect(totals.getByText('450')).toBeVisible()

  // Топ вин — по среднему рейтингу вина, а не по порядку добавления (ТЗ §8.2).
  const top = page.locator('section').filter({ hasText: 'Топ-5 вин' }).first()
  await expect(top.getByText('Stats Saperavi')).toBeVisible()
  await expect(top.getByText('Stats Rkatsiteli')).toBeVisible()

  // Период переключается, и «всё время» показывает те же записи.
  await page.getByRole('button', { name: 'Всё время' }).click()
  await expect(totals.getByText('2', { exact: true })).toBeVisible()
})

test('выгрузка дневника скачивается файлом с записями (ТЗ §14)', async ({ page }) => {
  await registerUser(page, uniqueEmail('e2e-export'), 'E2E Export')
  await addEntry(page, { wineName: 'Export E2E', type: 'WHITE', rating: 3.5 })

  await page.getByRole('link', { name: 'Профиль' }).click()

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Скачать CSV' }).click()
  const file = await download

  // Имя файла назначает сервер, поэтому проверяем именно его, а не выдумку браузера.
  expect(file.suggestedFilename()).toMatch(/^between-bubbles-\d{4}-\d{2}-\d{2}\.csv$/)

  const path = await file.path()
  const content = await (await import('node:fs/promises')).readFile(path, 'utf8')
  expect(content).toContain('Дата,Вино')
  expect(content).toContain('Export E2E')
})

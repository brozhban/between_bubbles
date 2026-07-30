import { e2ePassword, expect, registerUser, test, uniqueEmail } from '../helpers/test'

test('blocks registration under 18 and without consent', async ({ page }) => {
  await page.goto('/')

  const underage = new Date()
  underage.setUTCFullYear(underage.getUTCFullYear() - 16)

  await page.getByLabel('Email').fill(uniqueEmail())
  await page.getByLabel('Пароль').fill(e2ePassword)
  await page.getByLabel('Дата рождения').fill(underage.toISOString().slice(0, 10))

  // Галочка записывает версию оферты (ТЗ §14), поэтому оба документа должны открываться
  // до нажатия. Ссылка в никуда — это согласие с текстом, которого человек не видел.
  await expect(page.getByRole('link', { name: 'оферту' })).toHaveAttribute('href', /\/offer$/)
  await expect(page.getByRole('link', { name: 'политике конфиденциальности' })).toHaveAttribute(
    'href',
    /\/privacy$/,
  )

  // Галочка не проставлена заранее: явное согласие требуют и грузинский закон, и GDPR.
  await expect(page.getByRole('checkbox')).not.toBeChecked()

  // Без галочки согласия дальше не пускает — и объясняет причину человеческим текстом.
  await page.getByRole('button', { name: 'Создать аккаунт' }).click()
  await expect(page.getByText(/Подтвердите, что вам есть 18/)).toBeVisible()

  await page.getByRole('checkbox').click()
  await page.getByRole('button', { name: 'Создать аккаунт' }).click()
  await expect(page.getByText(/18 years old/)).toBeVisible()

  // Аккаунт не создан: экран недели не появился.
  await expect(page.getByRole('heading', { name: 'Between Bubbles' })).toBeVisible()
})

test('registers, keeps the session across a reload, and logs out', async ({ page }) => {
  const email = uniqueEmail()

  await registerUser(page, email, 'E2E Session')

  await expect(page.getByText(/Неделя \d+ · \d{4}/)).toBeVisible()

  await expect
    .poll(async () =>
      (await page.context().cookies()).some(
        (cookie) => cookie.name === 'between_bubbles_refresh' && cookie.httpOnly,
      ),
    )
    .toBe(true)

  const refreshAfterReload = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/auth/refresh') && response.request().method() === 'POST',
  )
  await page.reload()
  expect((await refreshAfterReload).status()).toBe(200)
  await expect(page.getByText(/Неделя \d+ · \d{4}/)).toBeVisible()

  await page.getByRole('button', { name: 'Выйти' }).click()
  await expect(page.getByLabel('Дата рождения')).toBeVisible()
})

/**
 * Восстановление пароля целиком (ссылка из письма → новый пароль) проверяется
 * интеграционными тестами API: токен живёт только в письме, и браузеру его взять неоткуда.
 * Здесь — та часть, которую видит человек: форма, обещание письма и просроченная ссылка.
 */
test('восстановление пароля: обещание письма и просроченная ссылка', async ({ page }) => {
  const email = uniqueEmail('e2e-forgot')
  await registerUser(page, email, 'E2E Forgot')
  await page.getByRole('button', { name: 'Выйти' }).click()

  await page.getByRole('tab', { name: 'Вход' }).click()
  await page.getByRole('button', { name: 'Забыли пароль?' }).click()
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Прислать ссылку' }).click()

  // Формулировка одинакова для любого адреса: форма не должна работать проверкой,
  // заведён ли человек в дневнике.
  await expect(page.getByText(/Если такой адрес есть в дневнике/)).toBeVisible()

  // Негодный токен виден только на отправке: заранее спрашивать сервер «жива ли ссылка»
  // значило бы завести оракул, отвечающий на чужие токены.
  await page.goto('/reset-password?token=this-token-was-never-issued-at-all')
  await page.getByLabel('Новый пароль').fill('some-new-password-1')
  await page.getByRole('button', { name: 'Сохранить пароль' }).click()

  await expect(page.getByText(/Ссылка устарела или уже использована/)).toBeVisible()
  await expect(page.getByLabel('Новый пароль')).toHaveCount(0)
})

test('неподтверждённая почта напоминает о себе, но ничего не блокирует', async ({ page }) => {
  await registerUser(page, uniqueEmail('e2e-verify'), 'E2E Verify')

  // Дневник открыт сразу после регистрации — подтверждение почты мягкое (ТЗ §13).
  await expect(page.getByText(/Неделя \d+ · \d{4}/)).toBeVisible()
  await expect(page.getByText(/Почта не подтверждена/)).toBeVisible()

  await page.getByRole('button', { name: 'Прислать письмо' }).click()
  await expect(page.getByText(/Письмо отправлено/)).toBeVisible()

  await page.getByRole('button', { name: 'Скрыть' }).click()
  await expect(page.getByText(/Письмо отправлено/)).toHaveCount(0)
})

test('rejects a login with the wrong password', async ({ page }) => {
  const email = uniqueEmail()
  await registerUser(page, email, 'E2E Login')
  await page.getByRole('button', { name: 'Выйти' }).click()

  await page.getByRole('tab', { name: 'Вход' }).click()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Пароль').fill('definitely-not-the-password')
  await page.getByRole('button', { name: 'Войти' }).click()

  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByLabel('Дата рождения')).toHaveCount(0)

  await page.getByLabel('Пароль').fill(e2ePassword)
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page.getByText(/Неделя \d+ · \d{4}/)).toBeVisible()
})

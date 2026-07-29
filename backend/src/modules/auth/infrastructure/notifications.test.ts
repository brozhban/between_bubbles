import { afterEach, describe, expect, test } from 'bun:test'

import { createAuthNotifications, createResendMailer, type Mailer } from './notifications'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

/** Подменяет сеть: настоящих писем в тестах не шлём, но проверяем, что именно ушло бы. */
function captureRequest(response: Response) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return response
  }) as unknown as typeof fetch

  return calls
}

describe('resend mailer (ТЗ §13)', () => {
  test('отправляет письмо от заданного отправителя с ключом в заголовке', async () => {
    const calls = captureRequest(new Response('{"id":"1"}', { status: 200 }))

    await createResendMailer({ apiKey: 'test-key', from: 'Between Bubbles <noreply@example.com>' })
      .send({ to: 'user@example.com', subject: 'Тема', text: 'Ссылка' })

    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe('https://api.resend.com/emails')
    expect((calls[0]?.init.headers as Record<string, string>).Authorization).toBe('Bearer test-key')

    const payload = JSON.parse(String(calls[0]?.init.body))
    expect(payload).toMatchObject({
      from: 'Between Bubbles <noreply@example.com>',
      to: ['user@example.com'],
      subject: 'Тема',
      text: 'Ссылка',
    })
  })

  test('отказ провайдера превращается в ошибку с его же объяснением', async () => {
    captureRequest(new Response('domain is not verified', { status: 403 }))

    await expect(
      createResendMailer({ apiKey: 'test-key', from: 'noreply@example.com' }).send({
        to: 'user@example.com',
        subject: 'Тема',
        text: 'Ссылка',
      }),
    ).rejects.toThrow('domain is not verified')
  })

  test('сбой отправки не роняет регистрацию и не выдаёт наличие адреса', async () => {
    const failing: Mailer = {
      send: () => Promise.reject(new Error('provider is down')),
    }
    const notifications = createAuthNotifications({
      mailer: failing,
      webappUrl: 'https://app.example.com',
    })

    // Наверх ошибка не уходит: письмо — побочный эффект регистрации, а не её условие.
    await expect(
      notifications.passwordReset({ email: 'user@example.com', locale: 'ru', token: 'token' }),
    ).resolves.toBeUndefined()
  })

  test('ссылка в письме ведёт на адрес дневника, а не на бэкенд', async () => {
    const sent: string[] = []
    const notifications = createAuthNotifications({
      mailer: { send: async (message) => void sent.push(message.text) },
      webappUrl: 'https://app.example.com/',
    })

    await notifications.passwordReset({ email: 'user@example.com', locale: 'ru', token: 'abc' })
    await notifications.emailVerification({ email: 'user@example.com', locale: 'en', token: 'xyz' })

    expect(sent[0]).toContain('https://app.example.com/reset-password?token=abc')
    expect(sent[1]).toContain('https://app.example.com/verify-email?token=xyz')
  })
})

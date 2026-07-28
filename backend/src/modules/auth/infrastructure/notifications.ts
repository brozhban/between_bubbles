import type { AuthNotifications } from '../application/ports'

export type MailMessage = { to: string; subject: string; text: string }

export type Mailer = {
  send(message: MailMessage): Promise<void>
}

/**
 * Почтовый провайдер для проекта ещё не выбран (ТЗ §17), поэтому письма уходят в лог:
 * ссылку видно в выводе бэкенда, и весь сценарий восстановления работает локально целиком.
 *
 * В продакшене это заглушка, и она об этом честно предупреждает: подключение провайдера —
 * отдельная задача перед запуском.
 */
export function createLogMailer(input: { isProduction: boolean }): Mailer {
  if (input.isProduction) {
    console.warn(
      'Mail provider is not configured: account emails are written to the log instead of being sent.',
    )
  }

  return {
    async send(message) {
      console.log(`[mail] to=${message.to} subject=${message.subject}\n${message.text}`)
    },
  }
}

/**
 * Письма аккаунта. Ссылка ведёт в webapp, а не в API: по ней открывается экран, где человек
 * задаёт новый пароль или видит результат подтверждения.
 */
export function createAuthNotifications(input: {
  mailer: Mailer
  webappUrl: string
}): AuthNotifications {
  const link = (path: string, token: string) =>
    `${input.webappUrl.replace(/\/$/, '')}${path}?token=${encodeURIComponent(token)}`

  const send = async (message: MailMessage) => {
    try {
      await input.mailer.send(message)
    } catch (error) {
      // Наверх не пробрасываем: сбой доставки не должен ронять регистрацию и не должен
      // подсказывать, есть ли такой адрес в дневнике.
      console.error(`Failed to send the ${message.subject} email`, error)
    }
  }

  return {
    passwordReset: ({ email, locale, token }) =>
      send({
        to: email,
        ...(locale === 'en' ? passwordResetEn : passwordResetRu)(link('/reset-password', token)),
      }),

    emailVerification: ({ email, locale, token }) =>
      send({
        to: email,
        ...(locale === 'en' ? verifyEmailEn : verifyEmailRu)(link('/verify-email', token)),
      }),
  }
}

const passwordResetRu = (url: string) => ({
  subject: 'Восстановление пароля — Between Bubbles',
  text: [
    'Вы запросили новый пароль для Between Bubbles.',
    '',
    `Задать пароль: ${url}`,
    '',
    'Ссылка действует один час и работает один раз.',
    'Если это были не вы, просто удалите письмо — пароль останется прежним.',
  ].join('\n'),
})

const passwordResetEn = (url: string) => ({
  subject: 'Password reset — Between Bubbles',
  text: [
    'You asked for a new password for your wine diary.',
    '',
    `Set a new password: ${url}`,
    '',
    'The link works once and expires in an hour.',
    'If this was not you, delete this email — your password stays as it is.',
  ].join('\n'),
})

const verifyEmailRu = (url: string) => ({
  subject: 'Подтверждение почты — Between Bubbles',
  text: [
    'Подтвердите адрес, чтобы было куда восстанавливать пароль.',
    '',
    `Подтвердить: ${url}`,
    '',
    'Ссылка действует сутки. Дневником можно пользоваться и без подтверждения.',
  ].join('\n'),
})

const verifyEmailEn = (url: string) => ({
  subject: 'Confirm your email — Between Bubbles',
  text: [
    'Confirm your address so there is somewhere to send a password reset.',
    '',
    `Confirm: ${url}`,
    '',
    'The link works for a day. The diary stays fully usable without confirming.',
  ].join('\n'),
})

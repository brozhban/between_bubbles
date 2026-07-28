import type { Page } from '@playwright/test'

export { expect, test } from '@playwright/test'

export const e2ePassword = 'quiet-cellar-42'

/** Дата рождения заведомо совершеннолетнего: регистрация закрыта для младше 18 (ТЗ §14). */
export const e2eBirthDate = '1990-01-01'

export function uniqueEmail(prefix = 'web-e2e') {
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '')
  const suffix = Math.random().toString(36).slice(2, 8)

  return `${prefix}-${timestamp}-${suffix}@example.com`
}

/** Регистрация с 18+ и согласием — вход в приложение для всех остальных сценариев. */
export async function registerUser(page: Page, email: string, displayName = 'E2E') {
  await page.goto('/')

  await page.getByLabel('Имя').fill(displayName)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Пароль').fill(e2ePassword)
  await page.getByLabel('Дата рождения').fill(e2eBirthDate)
  await page.getByRole('checkbox').click()
  await page.getByRole('button', { name: 'Создать аккаунт' }).click()
}

/**
 * Дата дегустации — всегда сегодня.
 *
 * Любой сдвиг назад рискует перескочить через понедельник и увести запись в прошлую
 * неделю, из-за чего тест на метрики недели падал бы раз в семь запусков. Будущее
 * сервер отклоняет, так что «сегодня» — единственная безопасная дата.
 */
export function tastingDate(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Настоящий JPEG 48×48 в 675 байт: браузер обязан его декодировать, иначе клиентское сжатие
 * (canvas → JPEG) проверить нечем. Картинка лежит здесь строкой, а не файлом в репозитории,
 * чтобы бинарь не жил в git и не требовал отдельной генерации перед прогоном.
 */
export function tastingPhoto(): { name: string; mimeType: string; buffer: Buffer } {
  return {
    name: 'bottle.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from(jpegBase64, 'base64'),
  }
}

const jpegBase64 =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVt' +
  'VkVGZIhlbXd7gYKBTmCNl4x9lnN+gXwBFRcXHhoeOyEhO3xTRlN8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8' +
  'fHx8fHx8fHx8fHx8fHx8fHx8fHx8fP/AABEIADAAMAMBEQACEQEDEQH/xAGiAAABBQEBAQEBAQAAAAAAAAAAAQID' +
  'BAUGBwgJCgsQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYX' +
  'GBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqi' +
  'o6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+gEAAwEBAQEBAQEB' +
  'AQAAAAAAAAECAwQFBgcICQoLEQACAQIEBAMEBwUEBAABAncAAQIDEQQFITEGEkFRB2FxEyIygQgUQpGhscEJIzNS' +
  '8BVictEKFiQ04SXxFxgZGiYnKCkqNTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeI' +
  'iYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2dri4+Tl5ufo6ery8/T19vf4+fr/' +
  '2gAMAwEAAhEDEQA/AMqsz0QoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoA' +
  'KACgAoAKACgAoAKAP//Z'

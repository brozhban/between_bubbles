import { createHmac, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { PutObjectCommand } from '@aws-sdk/client-s3'

import type { StorageService } from '../../../storage/service'
import { assertSafeObjectKey } from '../../../storage/service'
import type { ObjectStore } from '../application/ports'

/**
 * Хранилище фото на диске для локальной разработки.
 *
 * Приватность и TTL те же, что у Spaces: файлы лежат вне веб-корня, а ссылка — это путь
 * к бэкенд-маршруту `/media/{key}` с HMAC-подписью и сроком годности. Прод-код этим адаптером
 * не пользуется — там всегда Spaces.
 */
export function createLocalObjectStore(input: {
  directory: string
  baseUrl: string
  signingSecret: string
}): ObjectStore & {
  read(key: string): Promise<Uint8Array>
  verifySignedKey(key: string, expires: string, signature: string): boolean
} {
  const root = resolve(input.directory)

  const pathForKey = (key: string) => {
    const safeKey = assertSafeObjectKey(key)
    // resolve + префиксная проверка не дают выйти из каталога даже при хитром ключе.
    const absolute = resolve(root, safeKey)
    if (absolute !== root && !absolute.startsWith(root + '/')) {
      throw new Error('Resolved media path escapes the storage root')
    }
    return absolute
  }

  const sign = (key: string, expires: string) =>
    createHmac('sha256', input.signingSecret).update(`${key}:${expires}`).digest('hex')

  return {
    async put({ key, bytes }) {
      const filePath = pathForKey(key)
      await mkdir(dirname(filePath), { recursive: true })
      await writeFile(filePath, bytes)
    },

    async delete(key) {
      await rm(pathForKey(key), { force: true })
    },

    async signedUrl({ key, ttlSeconds }) {
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000)
      const expires = String(Math.floor(expiresAt.getTime() / 1000))
      const signature = sign(key, expires)
      const params = new URLSearchParams({ key, expires, signature })
      return { url: `${input.baseUrl}/media?${params.toString()}`, expiresAt: expiresAt.toISOString() }
    },

    async read(key) {
      return new Uint8Array(await readFile(pathForKey(key)))
    },

    verifySignedKey(key, expires, signature) {
      if (!/^\d+$/.test(expires) || Number(expires) * 1000 < Date.now()) return false

      const expected = sign(key, expires)
      const expectedBytes = Buffer.from(expected)
      const actualBytes = Buffer.from(signature)
      return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes)
    },
  }
}

/**
 * Прод-хранилище поверх DigitalOcean Spaces. Приватный бакет: наружу только подписанный GET
 * с коротким TTL, выдаваемый бэкендом владельцу (ТЗ §11). Ключи вида
 * `users/{userId}/entries/{entryId}/{photoId}.jpg`.
 */
export function createSpacesObjectStore(
  storage: StorageService,
  s3Bucket: string,
  // S3-клиент прячется внутри StorageService, поэтому put идёт через отдельно переданный putObject.
  putObject: (input: { key: string; bytes: Uint8Array; contentType: string }) => Promise<void>,
): ObjectStore {
  return {
    put(input) {
      return putObject(input)
    },
    delete(key) {
      return storage.deleteObject(key)
    },
    async signedUrl({ key, ttlSeconds }) {
      const { downloadUrl, expiresAt } = await storage.createDownloadUrl({
        key,
        expiresInSeconds: ttlSeconds,
      })
      return { url: downloadUrl, expiresAt }
    },
  }
}

/** Загрузка приватного объекта в Spaces. Вынесена наружу, чтобы StorageService оставался про URL. */
export function createSpacesPutObject(input: {
  s3: {
    send: (command: PutObjectCommand) => Promise<unknown>
  }
  bucket: string
}) {
  return async ({ key, bytes, contentType }: { key: string; bytes: Uint8Array; contentType: string }) => {
    await input.s3.send(
      new PutObjectCommand({
        Bucket: input.bucket,
        Key: assertSafeObjectKey(key),
        Body: bytes,
        ContentType: contentType,
        ACL: 'private',
      }),
    )
  }
}

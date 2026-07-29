import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'

import type { AppEnv } from '../../../env'
import { assertSafeObjectKey } from '../../../storage/service'
import type { BackupStorage } from '../application/backup-service'

/**
 * Копии лежат в том же приватном бакете, что и фото, но под своим префиксом. Отдельный
 * бакет ничего бы не добавил: доступ к нему открывает тот же ключ.
 */
export function createSpacesBackupStorage(env: AppEnv): BackupStorage | null {
  if (
    !env.SPACES_REGION ||
    !env.SPACES_BUCKET ||
    !env.SPACES_ENDPOINT ||
    !env.SPACES_ACCESS_KEY_ID ||
    !env.SPACES_SECRET_ACCESS_KEY
  ) {
    return null
  }

  const bucket = env.SPACES_BUCKET
  const s3 = new S3Client({
    region: env.SPACES_REGION,
    endpoint: env.SPACES_ENDPOINT,
    credentials: {
      accessKeyId: env.SPACES_ACCESS_KEY_ID,
      secretAccessKey: env.SPACES_SECRET_ACCESS_KEY,
    },
  })

  return {
    async put({ key, bytes }) {
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: assertSafeObjectKey(key),
          Body: bytes,
          ContentType: 'application/gzip',
          ACL: 'private',
        }),
      )
    },

    async get(key) {
      const response = await s3.send(
        new GetObjectCommand({ Bucket: bucket, Key: assertSafeObjectKey(key) }),
      )
      const body = await response.Body?.transformToByteArray()
      if (!body) throw new Error(`Backup ${key} is empty`)

      return body
    },

    async list(prefix) {
      const response = await s3.send(
        new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, MaxKeys: 1000 }),
      )

      return (response.Contents ?? [])
        .map((object) => object.Key)
        .filter((key): key is string => typeof key === 'string')
    },

    async delete(key) {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: assertSafeObjectKey(key) }))
    },
  }
}

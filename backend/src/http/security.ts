import type { Context, MiddlewareHandler } from 'hono'
import { getConnInfo } from 'hono/bun'
import { bodyLimit } from 'hono/body-limit'
import { isIP } from 'node:net'

import { errorResponse } from './errors'

type ClientAddressOptions = {
  trustProxy: boolean
  trustedProxyClientIpHeader?: string
  trustedProxyClientIpPosition?: 'first' | 'last'
}

type AuthSecurityOptions = ClientAddressOptions & {
  bodyLimitBytes: number
  rateLimitMax: number
  rateLimitWindowSeconds: number
}

/** ТЗ §13 требует лимит и на вход, и на загрузку файлов — поводы отказать разные. */
export type RateLimitOptions = ClientAddressOptions & {
  max: number
  windowSeconds: number
  message: string
}

type RateLimitBucket = {
  count: number
  resetAt: number
}

const maxTrackedClients = 10_000

export function createAuthSecurity(options: AuthSecurityOptions): MiddlewareHandler[] {
  return [
    bodyLimit({
      maxSize: options.bodyLimitBytes,
      onError: (c) => c.json(errorResponse('PAYLOAD_TOO_LARGE', 'Request body is too large'), 413),
    }),
    createRateLimit({
      ...options,
      max: options.rateLimitMax,
      windowSeconds: options.rateLimitWindowSeconds,
      message: 'Too many authentication requests',
    }),
  ]
}

/**
 * Счётчик запросов в памяти процесса, ключ — адрес клиента. Один инстанс бэкенда владеет
 * своими счётчиками; общего хранилища здесь нет и не нужно, пока инстанс один.
 */
export function createRateLimit(options: RateLimitOptions): MiddlewareHandler {
  const buckets = new Map<string, RateLimitBucket>()
  const windowMs = options.windowSeconds * 1000

  return async (c, next) => {
    if (c.req.method === 'OPTIONS' || c.req.method === 'GET') {
      await next()
      return
    }

    const now = Date.now()
    let key = clientAddress(c, options)
    let bucket = buckets.get(key)

    if (!bucket || bucket.resetAt <= now) {
      if (buckets.size >= maxTrackedClients - 1) {
        deleteExpiredBuckets(buckets, now)
      }
      if (buckets.size >= maxTrackedClients - 1) {
        key = 'overflow'
        bucket = buckets.get(key)
      }
    }

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs }
      buckets.set(key, bucket)
    }

    bucket.count += 1
    c.header('RateLimit-Limit', String(options.max))
    c.header('RateLimit-Remaining', String(Math.max(0, options.max - bucket.count)))
    c.header('RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)))

    if (bucket.count > options.max) {
      c.header('Retry-After', String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))))
      return c.json(errorResponse('RATE_LIMITED', options.message), 429)
    }

    await next()
  }
}

export function clientAddress(c: Context, options: ClientAddressOptions) {
  if (options.trustProxy && options.trustedProxyClientIpHeader) {
    const addresses = c.req
      .header(options.trustedProxyClientIpHeader)
      ?.split(',')
      .map((address) => address.trim())
      .filter(Boolean)
    const forwardedAddress = options.trustedProxyClientIpPosition === 'last'
      ? addresses?.at(-1)
      : addresses?.[0]
    if (forwardedAddress && isIP(forwardedAddress)) return forwardedAddress
  }

  try {
    return getConnInfo(c).remote.address || 'unknown'
  } catch {
    return 'unknown'
  }
}

function deleteExpiredBuckets(buckets: Map<string, RateLimitBucket>, now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}

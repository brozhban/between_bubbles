import { expect, test } from 'bun:test'

import type { DbClient } from '../../../db'
import { createPrismaAuthRepository } from './auth-repository'
import { CURRENT_TERMS_VERSION } from '@between-bubbles/contracts'

test('creates a password user and initial session inside one database transaction', async () => {
  const operations: string[] = []
  const createdAt = new Date('2026-01-01T00:00:00.000Z')
  const transactionClient = {
    user: {
      create: async () => {
        operations.push('user')
        return {
          id: 'user-1',
          email: 'user@example.com',
          passwordHash: 'password-hash',
          displayName: null,
          createdAt,
          updatedAt: createdAt,
        }
      },
    },
    authSession: {
      create: async () => {
        operations.push('session')
        return { id: 'session-1' }
      },
    },
  }
  const db = {
    $transaction: async (run: (tx: typeof transactionClient) => unknown) => run(transactionClient),
  } as unknown as DbClient

  const result = await createPrismaAuthRepository(db).createPasswordUserWithSession({
    user: {
      email: 'user@example.com',
      password: 'quiet-cellar-42',
      passwordHash: 'password-hash',
      displayName: undefined,
      birthDate: '1990-01-01',
      timezone: 'Asia/Tbilisi',
      locale: 'ru',
      acceptedTermsVersion: CURRENT_TERMS_VERSION,
    },
    session: {
      refreshTokenHash: 'refresh-hash',
      refreshTokenFamilyHash: 'refresh-family-hash',
      expiresAt: new Date('2026-02-01T00:00:00.000Z'),
      metadata: {},
    },
  })

  expect(operations).toEqual(['user', 'session'])
  expect(result).toMatchObject({
    user: { id: 'user-1' },
    session: { id: 'session-1' },
  })
})

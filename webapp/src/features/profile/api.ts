import {
  meResponseSchema,
  profileUpdateSchema,
  type ProfileUpdatePayload,
} from '@between-bubbles/contracts'

import type { AuthenticatedTransport } from '@/platform/api'

/** Настройки профиля (ТЗ §10.11). Ответ — тот же DTO пользователя, что отдаёт `/me`. */
export class ProfileApi {
  private readonly transport: AuthenticatedTransport

  constructor(transport: AuthenticatedTransport) {
    this.transport = transport
  }

  updateSettings(input: ProfileUpdatePayload) {
    return this.transport.request('/api/profile', meResponseSchema, {
      method: 'PATCH',
      body: profileUpdateSchema.parse(input),
    })
  }
}

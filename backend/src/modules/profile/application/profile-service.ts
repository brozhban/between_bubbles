import type { ProfileUpdatePayload, UserDto } from '@between-bubbles/contracts'

import { ProfileFailure } from '../domain/errors'
import type { ProfileRepository, ProfileSettings, ProfileUserRecord } from './ports'

/**
 * Приведение пользователя к DTO приходит извне: тот же самый маппинг отдаёт `/api/auth/me`,
 * и две копии неминуемо разъехались бы при добавлении поля в профиль.
 */
export type ProjectProfileUser = (user: ProfileUserRecord) => UserDto | Promise<UserDto>

type ProfileServiceDependencies = {
  repository: ProfileRepository
  projectUser: ProjectProfileUser
}

export class ProfileService {
  constructor(private readonly deps: ProfileServiceDependencies) {}

  /** ТЗ §10.11: экран настроек шлёт только изменившиеся поля. */
  async updateSettings(userId: string, payload: ProfileUpdatePayload): Promise<UserDto> {
    const settings: ProfileSettings = {}

    if (payload.displayName !== undefined) {
      // Пустая строка означает «убрать имя», а не «оставить как было».
      settings.displayName = payload.displayName === '' ? null : payload.displayName
    }
    if (payload.locale !== undefined) settings.locale = payload.locale
    if (payload.theme !== undefined) settings.theme = payload.theme
    if (payload.timezone !== undefined) settings.timezone = payload.timezone
    if (payload.defaultCurrency !== undefined) settings.defaultCurrency = payload.defaultCurrency
    if (payload.showSpendTotals !== undefined) settings.showSpendTotals = payload.showSpendTotals

    const updated = await this.deps.repository.updateSettings({ userId, settings })
    if (!updated) throw new ProfileFailure('not_found', 'Profile not found')

    return this.deps.projectUser(updated)
  }
}

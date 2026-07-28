import { AppError } from '../../../http/errors'
import { DiaryFailure } from '../domain/errors'

export function toDiaryAppError(error: unknown) {
  if (!(error instanceof DiaryFailure)) return error

  switch (error.kind) {
    case 'not_found':
      // Чужой объект неотличим от несуществующего: 404, а не 403 (ТЗ §2).
      return new AppError(404, 'NOT_FOUND', error.message)
    case 'wine_in_use':
      return new AppError(409, 'CONFLICT', error.message)
    case 'store_quota_exceeded':
      return new AppError(429, 'RATE_LIMITED', error.message)
    default:
      return new AppError(400, 'BAD_REQUEST', error.message)
  }
}

export async function executeDiary<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    throw toDiaryAppError(error)
  }
}

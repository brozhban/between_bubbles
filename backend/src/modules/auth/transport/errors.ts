import { AppError } from '../../../http/errors'
import { AuthFailure } from '../domain/errors'

export function toAuthAppError(error: unknown) {
  if (!(error instanceof AuthFailure)) return error

  if (error.kind === 'email_already_exists') {
    return new AppError(409, 'CONFLICT', error.message)
  }

  // Просроченная или уже использованная ссылка из письма — это не «неверный пароль»:
  // клиенту нужно отличить её, чтобы предложить запросить письмо заново.
  if (error.kind === 'one_time_token_invalid') {
    return new AppError(410, 'GONE', error.message)
  }

  return new AppError(401, 'UNAUTHORIZED', error.message)
}

export async function executeAuth<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    throw toAuthAppError(error)
  }
}

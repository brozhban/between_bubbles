export type DiaryFailureKind =
  /** Объект не существует ИЛИ принадлежит другому пользователю — снаружи это неотличимо (ТЗ §2). */
  | 'not_found'
  | 'invalid_input'
  | 'wine_in_use'
  | 'store_quota_exceeded'

export class DiaryFailure extends Error {
  constructor(
    public readonly kind: DiaryFailureKind,
    message: string,
  ) {
    super(message)
  }
}

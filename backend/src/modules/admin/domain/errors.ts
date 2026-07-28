export type AdminFailureKind = 'not_found' | 'invalid_merge'

export class AdminFailure extends Error {
  constructor(
    public readonly kind: AdminFailureKind,
    message: string,
  ) {
    super(message)
  }
}

export type ShareFailureKind = 'not_found'

export class ShareFailure extends Error {
  constructor(
    public readonly kind: ShareFailureKind,
    message: string,
  ) {
    super(message)
  }
}

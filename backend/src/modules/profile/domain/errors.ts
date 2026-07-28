export type ProfileFailureKind = 'not_found'

export class ProfileFailure extends Error {
  constructor(
    public readonly kind: ProfileFailureKind,
    message: string,
  ) {
    super(message)
  }
}

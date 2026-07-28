export type PhotoFailureKind =
  | 'not_found'
  | 'invalid_image'
  | 'too_large'
  | 'limit_reached'

export class PhotoFailure extends Error {
  constructor(
    public readonly kind: PhotoFailureKind,
    message: string,
  ) {
    super(message)
  }
}

export type AuthMode = 'login' | 'register'
export type FieldName =
  | 'displayName'
  | 'email'
  | 'password'
  | 'birthDate'
  | 'acceptedTermsVersion'
export type FormError = { message?: string }
export type FieldErrors = Partial<Record<FieldName, FormError[]>>
export type AuthDraft = {
  email: string
  password: string
  displayName: string
  /** ТЗ §14: возрастной барьер 18+ проверяется до создания аккаунта. */
  birthDate: string
  acceptedTerms: boolean
}

export const emptyDraft: AuthDraft = {
  email: '',
  password: '',
  displayName: '',
  birthDate: '',
  acceptedTerms: false,
}

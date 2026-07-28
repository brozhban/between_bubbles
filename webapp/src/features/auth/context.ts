import type {
  EmailVerifyRequest,
  LoginRequest,
  PasswordForgotRequest,
  PasswordResetRequest,
  RegisterRequest,
  UserDto,
} from '@between-bubbles/contracts'
import { createContext } from 'react'
import type { AuthenticatedTransport } from '@/platform/api'

export type AuthContextValue = {
  user: UserDto | null
  isBootstrapping: boolean
  isAuthenticated: boolean
  sessionError: Error | null
  retrySession: () => Promise<void>
  transport: AuthenticatedTransport
  register: (input: RegisterRequest) => Promise<void>
  login: (input: LoginRequest) => Promise<void>
  logout: () => Promise<void>
  /** Обе операции отзывают все сессии, поэтому после них пользователь разлогинен. */
  changePassword: (input: { currentPassword: string; newPassword: string }) => Promise<void>
  deleteAccount: (input: { password: string }) => Promise<void>
  /** Ссылки из письма: восстановление пароля и подтверждение почты (ТЗ §13). */
  requestPasswordReset: (input: PasswordForgotRequest) => Promise<void>
  resetPassword: (input: PasswordResetRequest) => Promise<void>
  verifyEmail: (input: EmailVerifyRequest) => Promise<void>
  requestEmailVerification: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

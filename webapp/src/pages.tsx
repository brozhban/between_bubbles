import { AGE_DISCLAIMER_EN, AGE_DISCLAIMER_RU } from '@between-bubbles/contracts'
import { useNavigate } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { Card, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { Typography } from '@/components/ui/typography'
import {
  AuthForm,
  ResetPasswordScreen,
  useAuth,
  useTranslation,
  VerifyEmailScreen,
} from '@/features/auth'
import {
  EntryForm,
  EntryScreen,
  OutlinedButton,
  StatsScreen,
  TrashScreen,
  WeekScreen,
  WineScreen,
  WinesScreen,
} from '@/features/diary'
import { AdminStoresScreen } from '@/features/admin'
import { ProfileScreen } from '@/features/profile'
import {
  editEntryRoute,
  entryRoute,
  resetPasswordRoute,
  verifyEmailRoute,
  wineRoute,
} from './routes'

export function HomePage() {
  return <Protected>{() => <WeekScreen />}</Protected>
}

export function AddEntryPage() {
  return <Protected>{() => <EntryForm />}</Protected>
}

export function EntryPage() {
  const { entryId } = entryRoute.useParams()
  return <Protected>{() => <EntryScreen entryId={entryId} />}</Protected>
}

export function EditEntryPage() {
  const { entryId } = editEntryRoute.useParams()
  return <Protected>{() => <EntryForm entryId={entryId} />}</Protected>
}

export function WinesPage() {
  return <Protected>{() => <WinesScreen />}</Protected>
}

export function WinePage() {
  const { wineId } = wineRoute.useParams()
  return <Protected>{() => <WineScreen wineId={wineId} />}</Protected>
}

export function ProfilePage() {
  return <Protected>{() => <ProfileScreen />}</Protected>
}

export function StatsPage() {
  return <Protected>{() => <StatsScreen />}</Protected>
}

export function AdminStoresPage() {
  return <Protected>{() => <AdminStoresScreen />}</Protected>
}

export function TrashPage() {
  return <Protected>{() => <TrashScreen />}</Protected>
}

/**
 * Экраны по ссылке из письма (ТЗ §13) намеренно вне `Protected`: на восстановление пароля
 * приходят без сессии, а подтверждение почты открывают и с чужого устройства.
 */
export function ResetPasswordPage() {
  const { token } = resetPasswordRoute.useSearch()
  const navigate = useNavigate()

  return (
    <section className="mx-auto grid w-full max-w-xl gap-8 px-4 py-10">
      <ResetPasswordScreen token={token} onDone={() => void navigate({ to: '/' })} />
    </section>
  )
}

export function VerifyEmailPage() {
  const { token } = verifyEmailRoute.useSearch()
  const navigate = useNavigate()

  return (
    <section className="mx-auto grid w-full max-w-xl gap-8 px-4 py-10">
      <VerifyEmailScreen token={token} onDone={() => void navigate({ to: '/' })} />
    </section>
  )
}

/**
 * Общий гард всех экранов за логином: пока сессия проверяется — спиннер, при обрыве связи —
 * восстановимая ошибка, без сессии — форма входа. Дублировать это в каждом экране незачем.
 */
function Protected({ children }: { children: () => ReactNode }) {
  const auth = useAuth()

  if (auth.isBootstrapping) return <LoadingState />
  if (auth.sessionError && !auth.user) return <SessionErrorState retry={auth.retrySession} />
  if (!auth.user) return <SignedOutState />

  return <>{children()}</>
}

function SignedOutState() {
  const { t, locale } = useTranslation()

  return (
    <section className="mx-auto grid w-full max-w-xl gap-8 px-4 py-10">
      <div className="grid gap-3">
        <Typography variant="wineNameLg">{t('app.name')}</Typography>
        <Typography tone="muted">{t('app.tagline')}</Typography>
        <Typography variant="caption" tone="muted">
          {locale === 'en' ? AGE_DISCLAIMER_EN : AGE_DISCLAIMER_RU}
        </Typography>
      </div>
      <AuthForm />
    </section>
  )
}

function LoadingState() {
  const { t } = useTranslation()

  return (
    <section className="mx-auto w-full max-w-xl px-4 py-10">
      <Card className="w-fit">
        <CardContent className="flex items-center gap-3">
          <Spinner />
          <Typography variant="bodySm" tone="muted">
            {t('session.checking')}
          </Typography>
        </CardContent>
      </Card>
    </section>
  )
}

function SessionErrorState({ retry }: { retry: () => Promise<void> }) {
  const { t } = useTranslation()

  return (
    <section className="mx-auto grid w-full max-w-xl gap-4 px-4 py-10" role="alert">
      <Typography variant="screenTitle">{t('session.unavailable')}</Typography>
      <Typography tone="muted">{t('session.unavailableHint')}</Typography>
      <OutlinedButton type="button" onClick={() => void retry()}>
        {t('session.retry')}
      </OutlinedButton>
    </section>
  )
}

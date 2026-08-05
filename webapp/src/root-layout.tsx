import { Link, Outlet } from '@tanstack/react-router'
import { useState } from 'react'

import { Typography } from '@/components/ui/typography'
import { EmailVerificationNotice, useAuth, useTranslation } from '@/features/auth'
import { AppBackground, BottomNav, TextLinkAction, WineBackgroundProvider } from '@/features/diary'
import { useAppliedTheme } from '@/features/profile'

export function RootLayout() {
  const auth = useAuth()
  const { t } = useTranslation()
  const [logoutErrorUser, setLogoutErrorUser] = useState(auth.user)

  useAppliedTheme(auth.user?.theme)

  const logout = async () => {
    setLogoutErrorUser(null)
    try {
      await auth.logout()
    } catch {
      setLogoutErrorUser(auth.user)
    }
  }

  return (
    <WineBackgroundProvider>
    <div className="relative flex min-h-svh flex-col bg-background text-foreground">
      <AppBackground />
      <header className="glass relative z-10 border-b border-border">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 py-4">
          <Typography asChild variant="capsNav">
            <Link to="/">{t('app.name')}</Link>
          </Typography>
          {auth.isAuthenticated && (
            <div className="ml-auto">
              <TextLinkAction type="button" arrow="" onClick={() => void logout()}>
                {t('session.logout')}
              </TextLinkAction>
            </div>
          )}
        </div>
        {auth.user && logoutErrorUser === auth.user && (
          <div className="mx-auto w-full max-w-2xl px-4 pb-3">
            <Typography role="alert" variant="bodySm" tone="destructive">
              {t('session.logoutFailed')}
            </Typography>
          </div>
        )}
      </header>

      {/* Напоминание о почте лежит вне колонки содержимого, поэтому несёт своё стекло. */}
      <div className="glass relative z-10 empty:hidden">
        <EmailVerificationNotice />
      </div>

      <main className="glass relative z-10 mx-auto w-full max-w-2xl flex-1">
        <Outlet />
      </main>

      {auth.isAuthenticated && <BottomNav />}
    </div>
    </WineBackgroundProvider>
  )
}

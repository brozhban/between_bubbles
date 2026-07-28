import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { Typography } from '@/components/ui/typography'
import { ApiRequestError } from '@/platform/api'
import { useAuth } from '../use-auth'
import { useTranslation } from '../use-translation'

type VerifyState = 'checking' | 'confirmed' | 'expired' | 'failed'

/**
 * Экран по ссылке подтверждения почты (ТЗ §13). Делать здесь нечего, кроме как показать
 * результат, поэтому запрос уходит сразу при открытии страницы.
 */
export function VerifyEmailScreen({ token, onDone }: { token: string; onDone: () => void }) {
  const auth = useAuth()
  const { t } = useTranslation()
  const [state, setState] = useState<VerifyState>(token === '' ? 'expired' : 'checking')
  const verifyEmail = auth.verifyEmail
  // Ссылка одноразовая: второй запрос по той же странице получил бы 410 и показал бы
  // «ссылка устарела» там, где почта только что подтвердилась.
  const hasStarted = useRef(false)

  useEffect(() => {
    if (token === '' || hasStarted.current) return
    hasStarted.current = true

    verifyEmail({ token })
      .then(() => setState('confirmed'))
      .catch((error: unknown) => {
        setState(error instanceof ApiRequestError && error.status === 410 ? 'expired' : 'failed')
      })
  }, [token, verifyEmail])

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{t('auth.verifyTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4">
          {state === 'checking' ? (
            <div className="flex items-center gap-3">
              <Spinner />
              <Typography tone="muted">{t('auth.verifyChecking')}</Typography>
            </div>
          ) : (
            <Typography role={state === 'confirmed' ? undefined : 'alert'}>
              {t(
                state === 'confirmed'
                  ? 'auth.verifyConfirmed'
                  : state === 'expired'
                    ? 'auth.verifyExpired'
                    : 'auth.verifyFailed',
              )}
            </Typography>
          )}

          {state !== 'checking' && (
            <Button type="button" onClick={onDone}>
              {t('auth.verifyToDiary')}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

import { useState } from 'react'

import { Typography } from '@/components/ui/typography'
import { useAuth } from '../use-auth'
import { useTranslation } from '../use-translation'

/**
 * Напоминание о неподтверждённой почте (ТЗ §13).
 *
 * Ничего не блокирует и закрывается на сессию: подтверждение нужно, чтобы было куда
 * восстанавливать пароль, а не чтобы мешать вести дневник.
 */
export function EmailVerificationNotice() {
  const auth = useAuth()
  const { t } = useTranslation()
  const [isHidden, setIsHidden] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [isSent, setIsSent] = useState(false)

  if (!auth.user || auth.user.emailVerified || isHidden) return null

  const resend = async () => {
    setIsSending(true)
    try {
      await auth.requestEmailVerification()
      setIsSent(true)
    } catch {
      // Молча: письмо можно запросить ещё раз, а ронять шапку из-за этого незачем.
      setIsSent(false)
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="border-b border-border bg-card">
      <div className="mx-auto flex w-full max-w-2xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Typography variant="bodySm" tone="muted" className="flex-1">
          {isSent ? t('auth.noticeSent') : t('auth.noticeUnverified')}
        </Typography>

        {!isSent && (
          <button type="button" className="hover:underline" disabled={isSending} onClick={() => void resend()}>
            <Typography variant="capsNav">
              {isSending ? t('auth.noticeSending') : t('auth.noticeResend')}
            </Typography>
          </button>
        )}

        <button type="button" className="hover:underline" onClick={() => setIsHidden(true)}>
          <Typography variant="capsNav" tone="muted">
            {t('auth.noticeHide')}
          </Typography>
        </button>
      </div>
    </div>
  )
}

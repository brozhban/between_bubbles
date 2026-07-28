import { useState } from 'react'

import { Switch } from '@/components/ui/switch'
import { Typography } from '@/components/ui/typography'
import { useTranslation } from '@/features/auth'
import { ApiRequestError } from '@/platform/api'
import {
  useCreateShareMutation,
  useRevokeShareMutation,
  useShareQuery,
  useUpdateShareMutation,
} from '../queries'
import { TextLinkAction } from './OutlinedButton'

/**
 * Публикация записи (ТЗ §12).
 *
 * Ссылку показываем текстом, а не только кнопкой «скопировать»: буфер обмена доступен не
 * везде (в Safari без жеста, в iframe, по http), и человек всегда должен видеть адрес,
 * который отдаёт другим.
 */
export function SharePanel({ entryId }: { entryId: string }) {
  const { t } = useTranslation()
  const share = useShareQuery(entryId)
  const createShare = useCreateShareMutation()
  const updateShare = useUpdateShareMutation()
  const revokeShare = useRevokeShareMutation()
  const [error, setError] = useState<string | null>(null)
  const [isCopied, setIsCopied] = useState(false)

  const link = share.data?.share ?? null
  const isBusy = createShare.isPending || updateShare.isPending || revokeShare.isPending

  const run = async (action: () => Promise<unknown>) => {
    setError(null)
    try {
      await action()
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : t('share.failed'))
    }
  }

  const copy = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link.url)
      setIsCopied(true)
    } catch {
      // Буфер недоступен — адрес и так на экране, его можно выделить руками.
      setIsCopied(false)
    }
  }

  return (
    <section className="grid gap-3 border-t border-border pt-6">
      <Typography variant="capsLabel" tone="muted">
        {t('share.label')}
      </Typography>

      {link === null ? (
        <>
          <Typography variant="caption" tone="muted">
            {t('share.hint')}
          </Typography>
          <div className="justify-self-start">
            <TextLinkAction
              type="button"
              disabled={isBusy}
              onClick={() => void run(() => createShare.mutateAsync({ entryId, showName: false }))}
            >
              {isBusy ? t('share.creating') : t('share.create')}
            </TextLinkAction>
          </div>
        </>
      ) : (
        <>
          {/* Адрес длинный и не переносится по словам — рвём по символам, иначе он вылезает. */}
          <Typography variant="bodySm" className="break-all">
            {link.url}
          </Typography>

          <div className="flex flex-wrap items-center gap-6">
            <TextLinkAction type="button" arrow="" onClick={() => void copy()}>
              {isCopied ? t('share.copied') : t('share.copy')}
            </TextLinkAction>
            <TextLinkAction
              type="button"
              arrow=""
              disabled={isBusy}
              onClick={() => void run(() => revokeShare.mutateAsync({ entryId }))}
            >
              {t('share.revoke')}
            </TextLinkAction>
          </div>

          <div className="flex items-center justify-between gap-4">
            <Typography variant="bodySm">{t('share.showName')}</Typography>
            <Switch
              checked={link.showName}
              disabled={isBusy}
              aria-label={t('share.showName')}
              onCheckedChange={(showName) =>
                void run(() => updateShare.mutateAsync({ entryId, showName }))
              }
            />
          </div>

          <Typography variant="caption" tone="muted">
            {t('share.contents')}
          </Typography>
        </>
      )}

      {error && (
        <Typography role="alert" tone="destructive">
          {error}
        </Typography>
      )}
    </section>
  )
}

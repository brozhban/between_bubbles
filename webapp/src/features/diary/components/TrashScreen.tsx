import type { Locale } from '@between-bubbles/contracts'
import { useState } from 'react'

import { Spinner } from '@/components/ui/spinner'
import { Typography } from '@/components/ui/typography'
import { useTranslation } from '@/features/auth'
import {
  useEmptyTrashMutation,
  usePurgeEntryMutation,
  useRestoreEntryMutation,
  useTrashQuery,
} from '../queries'
import { EntryRow } from './EntryRow'
import { OutlinedButton, TextLinkAction } from './OutlinedButton'

/**
 * Корзина (ТЗ §10.10). Записи здесь исключены из всех метрик, но восстановимы 30 дней —
 * после этого их удаляет фоновая задача `diary:trash:purge`.
 */
export function TrashScreen() {
  const { t, locale } = useTranslation()
  const trash = useTrashQuery()
  const restore = useRestoreEntryMutation()
  const purge = usePurgeEntryMutation()
  const empty = useEmptyTrashMutation()
  const [isConfirmingEmpty, setIsConfirmingEmpty] = useState(false)

  if (trash.isPending) {
    return (
      <div className="flex items-center gap-3 p-6">
        <Spinner />
        <Typography variant="bodySm" tone="muted">
          {t('trash.loading')}
        </Typography>
      </div>
    )
  }

  const items = trash.data?.items ?? []

  return (
    <div className="grid gap-8 p-4 pb-10">
      <header className="grid gap-2">
        <Typography variant="wineNameLg">{t('trash.title')}</Typography>
        <Typography tone="muted">{t('trash.description')}</Typography>
      </header>

      {items.length === 0 ? (
        <Typography tone="muted">{t('trash.empty')}</Typography>
      ) : (
        <>
          <div className="grid gap-4">
            {items.map((entry) => (
              <div key={entry.id} className="grid gap-2 border border-border">
                <EntryRow entry={entry} />
                <div className="flex items-center justify-between px-4 pb-3">
                  <Typography variant="caption" tone="muted">
                    {t('trash.deletedAt', { date: formatDeletedAt(entry.deletedAt, locale) })}
                  </Typography>
                  <div className="flex items-center gap-4">
                    <TextLinkAction
                      type="button"
                      arrow=""
                      onClick={() => restore.mutate(entry.id)}
                    >
                      {t('trash.restore')}
                    </TextLinkAction>
                    <TextLinkAction type="button" onClick={() => purge.mutate(entry.id)}>
                      {t('trash.purge')}
                    </TextLinkAction>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {isConfirmingEmpty ? (
            <div className="grid gap-3 border border-border p-4">
              <Typography variant="bodySm">
                {t('trash.emptyAllConfirm', { count: items.length })}
              </Typography>
              <div className="flex items-center justify-between">
                <TextLinkAction
                  type="button"
                  arrow=""
                  onClick={() => setIsConfirmingEmpty(false)}
                >
                  {t('trash.cancel')}
                </TextLinkAction>
                <TextLinkAction
                  type="button"
                  onClick={() => {
                    empty.mutate(undefined, { onSuccess: () => setIsConfirmingEmpty(false) })
                  }}
                >
                  {empty.isPending ? t('trash.emptying') : t('trash.emptyAll')}
                </TextLinkAction>
              </div>
            </div>
          ) : (
            <OutlinedButton type="button" onClick={() => setIsConfirmingEmpty(true)}>
              {t('trash.emptyAll')}
            </OutlinedButton>
          )}
        </>
      )}
    </div>
  )
}

function formatDeletedAt(value: string, locale: Locale): string {
  return new Date(value).toLocaleDateString(locale === 'en' ? 'en-GB' : 'ru-RU', {
    day: 'numeric',
    month: 'long',
  })
}

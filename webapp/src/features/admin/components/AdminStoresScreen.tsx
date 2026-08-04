import { storeKindLabels, type AdminStoreDto, type StoreStatus } from '@between-bubbles/contracts'
import { useState } from 'react'

import { Spinner } from '@/components/ui/spinner'
import { Typography } from '@/components/ui/typography'
import { useAuth, useTranslation } from '@/features/auth'
import {
  countryName,
  FlavorChips,
  TextLinkAction,
  UnderlineInput,
  UnderlineSelect,
} from '@/features/diary'
import { ApiRequestError } from '@/platform/api'
import { useAdminStoresQuery, useMergeStoreMutation, useSetStoreStatusMutation } from '../queries'

const statusFilters: ReadonlyArray<StoreStatus | 'ALL'> = ['ALL', 'ACTIVE', 'HIDDEN', 'MERGED']

/**
 * Постмодерация справочника магазинов (ТЗ §5.2 п.3, §10.12).
 *
 * Экран сознательно скучный: список, поиск и два действия. Администратор здесь не смотрит
 * дневники и не правит записи — он только склеивает дубли и прячет мусор.
 */
export function AdminStoresScreen() {
  const { t, locale } = useTranslation()
  const { user } = useAuth()
  const [status, setStatus] = useState<StoreStatus | 'ALL'>('ACTIVE')
  const [search, setSearch] = useState('')
  const [mergingId, setMergingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const stores = useAdminStoresQuery({
    ...(status === 'ALL' ? {} : { status }),
    ...(search.trim() === '' ? {} : { search: search.trim() }),
  })
  const mergeStore = useMergeStoreMutation()
  const setStoreStatus = useSetStoreStatusMutation()

  if (user?.isAdmin !== true) {
    return (
      <div className="grid gap-4 p-6" role="alert">
        <Typography variant="screenTitle">{t('admin.forbidden')}</Typography>
      </div>
    )
  }

  const items = stores.data?.items ?? []
  const mergeTargets = items.filter(
    (candidate) => candidate.id !== mergingId && candidate.status === 'ACTIVE',
  )

  const run = async (action: () => Promise<unknown>) => {
    setError(null)
    try {
      await action()
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : t('admin.failed'))
    }
  }

  return (
    <div className="grid gap-6 p-4 pb-10">
      <header className="grid gap-4">
        <Typography variant="wineNameLg">{t('admin.storesTitle')}</Typography>
        <Typography variant="caption" tone="muted">
          {t('admin.storesHint')}
        </Typography>

        <UnderlineInput
          label={t('admin.search')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <FlavorChips
          label={t('admin.status')}
          tone="b"
          options={statusFilters.map((option) => ({
            id: option,
            label: t(`admin.status.${option}`),
          }))}
          selected={[status]}
          onToggle={(id) => setStatus(id as StoreStatus | 'ALL')}
        />
      </header>

      {stores.isPending && (
        <div className="flex items-center gap-3">
          <Spinner />
          <Typography variant="bodySm" tone="muted">
            {t('admin.loading')}
          </Typography>
        </div>
      )}

      {stores.isError && (
        <Typography role="alert" tone="destructive">
          {t('admin.failed')}
        </Typography>
      )}

      {stores.data && items.length === 0 && (
        <Typography tone="muted">{t('admin.empty')}</Typography>
      )}

      <div className="grid">
        {items.map((store) => (
          <div key={store.id} className="grid gap-3 border-b border-border bg-card p-4">
            <div className="flex items-start justify-between gap-4">
              <span className="grid min-w-0 flex-1 gap-1">
                <Typography variant="wineName" truncate>
                  {store.name}
                </Typography>
                <Typography variant="capsMeta" tone="muted">
                  {metaLine(store, locale, t)}
                </Typography>
              </span>
              <Typography variant="capsPole" tone="muted">
                {t(`admin.storeStatus.${store.status}`)}
              </Typography>
            </div>

            {store.status !== 'MERGED' && (
              <div className="flex flex-wrap items-center gap-6">
                <TextLinkAction
                  type="button"
                  arrow=""
                  onClick={() =>
                    void run(() =>
                      setStoreStatus.mutateAsync({
                        storeId: store.id,
                        status: store.status === 'HIDDEN' ? 'ACTIVE' : 'HIDDEN',
                      }),
                    )
                  }
                >
                  {store.status === 'HIDDEN' ? t('admin.restore') : t('admin.hide')}
                </TextLinkAction>

                <TextLinkAction
                  type="button"
                  arrow=""
                  onClick={() => setMergingId(mergingId === store.id ? null : store.id)}
                >
                  {t('admin.merge')}
                </TextLinkAction>
              </div>
            )}

            {mergingId === store.id && (
              <div className="grid gap-3 border border-border bg-card p-3">
                <Typography variant="caption" tone="muted">
                  {t('admin.mergeHint')}
                </Typography>
                <UnderlineSelect
                  label={t('admin.mergeTarget')}
                  placeholder={t('admin.mergePick')}
                  value=""
                  options={mergeTargets.map((candidate) => ({
                    value: candidate.id,
                    label: `${candidate.name} · ${candidate.countryCode} · ${candidate.entryCount}`,
                  }))}
                  onChange={(event) => {
                    const targetId = event.target.value
                    if (targetId === '') return
                    void run(async () => {
                      await mergeStore.mutateAsync({ storeId: store.id, targetId })
                      setMergingId(null)
                    })
                  }}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {error && (
        <Typography role="alert" tone="destructive">
          {error}
        </Typography>
      )}
    </div>
  )
}

function metaLine(
  store: AdminStoreDto,
  locale: 'ru' | 'en',
  t: (key: 'admin.usage' | 'admin.entries', params: Record<string, string | number>) => string,
): string {
  return [
    countryName(store.countryCode, locale),
    store.city,
    storeKindLabels[store.kind][locale],
    t('admin.entries', { count: store.entryCount }),
    t('admin.usage', { count: store.usageCount }),
  ]
    .filter((part): part is string => part !== null && part !== '')
    .join(' · ')
}

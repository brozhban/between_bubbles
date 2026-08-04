import {
  currencyLabels,
  type Currency,
  type ExportFormat,
  type Locale,
  type Theme,
} from '@between-bubbles/contracts'
import { useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'

import { Switch } from '@/components/ui/switch'
import { Typography } from '@/components/ui/typography'
import { useAuth, useTranslation } from '@/features/auth'
import {
  FlavorChips,
  OutlinedButton,
  TextLinkAction,
  UnderlineInput,
  UnderlineSelect,
  useDiaryApi,
} from '@/features/diary'
import { ApiRequestError } from '@/platform/api'
import { useUpdateProfileMutation } from '../queries'

/** Названия языков не переводятся: их читает тот, кто хочет переключиться на этот язык. */
const localeOptions = [
  { id: 'ru', label: 'Русский' },
  { id: 'en', label: 'English' },
]

/** Настройки профиля (ТЗ §10.11) вместе с выгрузкой дневника (ТЗ §14). */
export function ProfileScreen() {
  const auth = useAuth()
  const { t } = useTranslation()
  const themeOptions = [
    { id: 'light', label: t('profile.themeLight') },
    { id: 'dark', label: t('profile.themeDark') },
    { id: 'system', label: t('profile.themeSystem') },
  ]
  const updateProfile = useUpdateProfileMutation()
  const user = auth.user

  const [displayName, setDisplayName] = useState(user?.displayName ?? '')
  const [locale, setLocale] = useState<Locale>(user?.locale ?? 'ru')
  const [theme, setTheme] = useState<Theme>(user?.theme ?? 'system')
  const [timezone, setTimezone] = useState(user?.timezone ?? 'Asia/Tbilisi')
  const [defaultCurrency, setCurrency] = useState<Currency>(user?.defaultCurrency ?? 'GEL')
  const [showSpendTotals, setShowSpendTotals] = useState(user?.showSpendTotals ?? false)
  const [error, setError] = useState<string | null>(null)
  const [isSaved, setIsSaved] = useState(false)

  const timezones = useMemo(() => supportedTimezones(), [])

  const save = async () => {
    setError(null)
    setIsSaved(false)
    try {
      await updateProfile.mutateAsync({
        displayName,
        locale,
        theme,
        timezone,
        defaultCurrency,
        showSpendTotals,
      })
      setIsSaved(true)
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError
          ? caught.message
          : t('profile.saveFailed'),
      )
    }
  }

  return (
    <div className="grid gap-8 p-4 pb-10">
      <header className="grid gap-2">
        <Typography variant="wineNameLg">{t('profile.title')}</Typography>
        <Typography variant="capsMeta" tone="muted">
          {user?.email ?? ''}
        </Typography>
      </header>

      <UnderlineInput
        label={t('profile.name')}
        value={displayName}
        placeholder={t('profile.namePlaceholder')}
        onChange={(event) => {
          setDisplayName(event.target.value)
          setIsSaved(false)
        }}
      />

      <FlavorChips
        label={t('profile.language')}
        tone="a"
        options={localeOptions}
        selected={[locale]}
        onToggle={(id) => {
          setLocale(id as Locale)
          setIsSaved(false)
        }}
      />

      <FlavorChips
        label={t('profile.theme')}
        tone="b"
        options={themeOptions}
        selected={[theme]}
        onToggle={(id) => {
          setTheme(id as Theme)
          setIsSaved(false)
        }}
      />

      <UnderlineSelect
        label={t('profile.timezone')}
        hint={t('profile.timezoneHint')}
        value={timezone}
        onChange={(event) => {
          setTimezone(event.target.value)
          setIsSaved(false)
        }}
        options={timezones.map((zone) => ({ value: zone, label: zone }))}
      />

      <UnderlineSelect
        label={t('profile.currency')}
        value={defaultCurrency}
        onChange={(event) => {
          setCurrency(event.target.value as Currency)
          setIsSaved(false)
        }}
        options={(Object.keys(currencyLabels) as Currency[]).map((currency) => ({
          value: currency,
          label: currencyLabels[currency][locale],
        }))}
      />

      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-4">
          <Typography variant="capsLabel" tone="muted">
            {t('profile.showSpend')}
          </Typography>
          <Switch
            checked={showSpendTotals}
            onCheckedChange={(checked) => {
              setShowSpendTotals(checked === true)
              setIsSaved(false)
            }}
          />
        </div>
        <Typography variant="caption" tone="muted">
          {t('profile.showSpendHint')}
        </Typography>
      </div>

      {error && (
        <Typography role="alert" tone="destructive">
          {error}
        </Typography>
      )}

      {isSaved && !error && (
        <Typography role="status" tone="muted">
          {t('profile.saved')}
        </Typography>
      )}

      <OutlinedButton type="button" disabled={updateProfile.isPending} onClick={() => void save()}>
        {updateProfile.isPending ? t('profile.saving') : t('profile.save')}
      </OutlinedButton>

      <ExportSection />
      {/* Админка справочника — только для администратора (ТЗ §2), обычный вход её не видит. */}
      {user?.isAdmin === true && <AdminSection />}
      <PasswordSection />
      <DangerSection />
    </div>
  )
}

/**
 * Выгрузка дневника (ТЗ §14). Файл приходит с авторизацией, поэтому это не обычная ссылка:
 * ответ забирается запросом и отдаётся браузеру как скачивание.
 */
function ExportSection() {
  const { t } = useTranslation()
  const api = useDiaryApi()
  const [busyFormat, setBusyFormat] = useState<ExportFormat | null>(null)
  const [error, setError] = useState<string | null>(null)

  const download = async (format: ExportFormat) => {
    setError(null)
    setBusyFormat(format)
    try {
      const file = await api.exportDiary(format)
      const url = URL.createObjectURL(file.blob)
      const link = document.createElement('a')
      link.href = url
      link.download = file.fileName ?? `between-bubbles.${format}`
      link.click()
      URL.revokeObjectURL(url)
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : t('profile.exportFailed'))
    } finally {
      setBusyFormat(null)
    }
  }

  return (
    <section className="grid gap-4 border-t border-border pt-6">
      <Typography variant="capsLabel" tone="muted">
        {t('profile.exportSection')}
      </Typography>
      <Typography variant="caption" tone="muted">
        {t('profile.exportHint')}
      </Typography>

      <div className="flex flex-wrap items-center gap-6">
        <TextLinkAction type="button" arrow="↓" onClick={() => void download('csv')}>
          {busyFormat === 'csv' ? t('profile.exportPreparing') : t('profile.exportCsv')}
        </TextLinkAction>
        <TextLinkAction type="button" arrow="↓" onClick={() => void download('json')}>
          {busyFormat === 'json' ? t('profile.exportPreparing') : t('profile.exportJson')}
        </TextLinkAction>
      </div>

      {error && (
        <Typography role="alert" tone="destructive">
          {error}
        </Typography>
      )}
    </section>
  )
}

function AdminSection() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <section className="grid gap-4 border-t border-border pt-6">
      <Typography variant="capsLabel" tone="muted">
        {t('admin.section')}
      </Typography>
      <div className="justify-self-start">
        <TextLinkAction type="button" onClick={() => void navigate({ to: '/admin/stores' })}>
          {t('admin.storesLink')}
        </TextLinkAction>
      </div>
    </section>
  )
}

/** Смена пароля выбрасывает все сессии, поэтому сразу после неё нужно войти заново. */
function PasswordSection() {
  const auth = useAuth()
  const { t } = useTranslation()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)

  const submit = async () => {
    setError(null)
    setIsBusy(true)
    try {
      await auth.changePassword({ currentPassword, newPassword })
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError && caught.status === 401
          ? t('profile.wrongCurrentPassword')
          : t('profile.changePasswordFailed'),
      )
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <section className="grid gap-4 border-t border-border pt-6">
      <Typography variant="capsLabel" tone="muted">
        {t('profile.passwordSection')}
      </Typography>
      <UnderlineInput
        label={t('profile.currentPassword')}
        type="password"
        autoComplete="current-password"
        value={currentPassword}
        onChange={(event) => setCurrentPassword(event.target.value)}
      />
      <UnderlineInput
        label={t('profile.newPassword')}
        type="password"
        autoComplete="new-password"
        hint={t('profile.newPasswordHint')}
        value={newPassword}
        onChange={(event) => setNewPassword(event.target.value)}
      />
      {error && (
        <Typography role="alert" tone="destructive">
          {error}
        </Typography>
      )}
      <OutlinedButton
        type="button"
        disabled={isBusy || currentPassword.length < 8 || newPassword.length < 8}
        onClick={() => void submit()}
      >
        {isBusy ? t('profile.changingPassword') : t('profile.changePassword')}
      </OutlinedButton>
    </section>
  )
}

/** Удаление аккаунта (ТЗ §14): мягкое, с окном на восстановление 30 дней. */
function DangerSection() {
  const auth = useAuth()
  const { t } = useTranslation()
  const [isConfirming, setIsConfirming] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)

  const submit = async () => {
    setError(null)
    setIsBusy(true)
    try {
      await auth.deleteAccount({ password })
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError && caught.status === 401
          ? t('profile.wrongPassword')
          : t('profile.deleteFailed'),
      )
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <section className="grid gap-4 border-t border-border pt-6">
      <Typography variant="capsLabel" tone="muted">
        {t('profile.dangerSection')}
      </Typography>

      {isConfirming ? (
        <div className="grid gap-4 border border-border bg-card p-4">
          <Typography variant="bodySm">
            {t('profile.deleteConfirm')}
          </Typography>
          <UnderlineInput
            label={t('auth.password')}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {error && (
            <Typography role="alert" tone="destructive">
              {error}
            </Typography>
          )}
          <div className="flex items-center justify-between gap-4">
            <TextLinkAction type="button" arrow="" onClick={() => setIsConfirming(false)}>
              {t('profile.keepAccount')}
            </TextLinkAction>
            <TextLinkAction
              type="button"
              disabled={isBusy || password.length < 8}
              onClick={() => void submit()}
            >
              {isBusy ? t('profile.deleting') : t('profile.deleteForever')}
            </TextLinkAction>
          </div>
        </div>
      ) : (
        <TextLinkAction type="button" onClick={() => setIsConfirming(true)}>
          {t('profile.deleteAccount')}
        </TextLinkAction>
      )}
    </section>
  )
}

/**
 * Список таймзон берём у среды выполнения. Если браузер старый и `supportedValuesOf`
 * недоступен, оставляем хотя бы текущую зону — экран не должен ломаться из-за справочника.
 */
function supportedTimezones(): string[] {
  const supported = Intl.supportedValuesOf?.('timeZone')
  if (supported && supported.length > 0) return [...supported]
  return [Intl.DateTimeFormat().resolvedOptions().timeZone]
}

import { storeKindLabels, type Locale, type StoreDto, type StoreKind } from '@between-bubbles/contracts'
import { useState } from 'react'

import { Typography } from '@/components/ui/typography'
import { useTranslation } from '@/features/auth'
import { useStoreSearchQuery } from '../queries'
import { OutlinedButton, TextLinkAction } from './OutlinedButton'
import { UnderlineInput } from './UnderlineField'
import { UnderlineSelect } from './UnderlineSelect'

export type StoreSelection =
  | { mode: 'existing'; storeId: string }
  | { mode: 'new'; name: string; countryCode: string; city?: string; kind?: StoreKind }

/**
 * Выбор магазина из общего справочника (ТЗ §5.2).
 *
 * Справочник пополняется без премодерации, поэтому перед созданием нового магазина
 * пользователю показывается ближайший похожий: «Возможно, вы имели в виду…». Это первый
 * из трёх слоёв защиты от мусора, и именно он ловит опечатки в момент ввода.
 */
export function StorePicker({
  value,
  onChange,
  countryCode,
  locale,
}: {
  value: StoreSelection | undefined
  onChange: (value: StoreSelection | undefined) => void
  /** Страна покупки из формы: подсказки сначала ищутся по ней. */
  countryCode: string
  locale: Locale
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<StoreDto | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [isSuggestionDismissed, setIsSuggestionDismissed] = useState(false)
  const [kind, setKind] = useState<StoreKind>('OTHER')
  const [city, setCity] = useState('')

  const search = useStoreSearchQuery({
    q: query.trim(),
    country: countryCode || undefined,
    enabled: query.trim().length >= 2 && !picked,
  })

  const suggestion = search.data?.duplicateSuggestion ?? null
  const options = dedupe([...(search.data?.recent ?? []), ...(search.data?.matches ?? [])])

  const select = (store: StoreDto) => {
    setPicked(store)
    setIsCreating(false)
    onChange({ mode: 'existing', storeId: store.id })
  }

  const clear = () => {
    setPicked(null)
    setIsCreating(false)
    setIsSuggestionDismissed(false)
    setQuery('')
    onChange(undefined)
  }

  // Пока похожий магазин не отклонён явно, форму создания не показываем: смысл подсказки
  // в том, чтобы её увидели до создания дубля, а не после.
  const isAskingAboutDuplicate = isCreating && suggestion !== null && !isSuggestionDismissed

  if (picked) {
    return (
      <div className="grid gap-2">
        <Typography variant="capsLabel" tone="muted">
          {t('store.label')}
        </Typography>
        <div className="flex items-center justify-between gap-3 border border-border bg-card p-3">
          <Typography variant="fieldValue">{describe(picked)}</Typography>
          <TextLinkAction type="button" arrow="" onClick={clear}>
            {t('store.change')}
          </TextLinkAction>
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-3">
      <UnderlineInput
        label={t('store.label')}
        value={query}
        placeholder={t('store.placeholder')}
        hint={countryCode === '' ? t('store.countryFirst') : undefined}
        onChange={(event) => {
          setQuery(event.target.value)
          setIsCreating(false)
          setIsSuggestionDismissed(false)
          onChange(undefined)
        }}
      />

      {options.length > 0 && (
        <div className="grid">
          {options.slice(0, 6).map((store) => (
            <button
              key={store.id}
              type="button"
              onClick={() => select(store)}
              className="flex items-center justify-between gap-3 border-b border-border py-2 text-left hover:bg-card"
            >
              <Typography variant="fieldValue">{describe(store)}</Typography>
              <Typography variant="capsPole" tone="muted">
                {storeKindLabels[store.kind][locale]}
              </Typography>
            </button>
          ))}
        </div>
      )}

      {/* Подсказка о дубле показывается только когда человек собрался создавать новый. */}
      {isAskingAboutDuplicate && (
        <div className="grid gap-3 border border-border bg-card p-3">
          <Typography variant="bodySm">
            {t('store.maybeMeant', { name: suggestion.name })}
          </Typography>
          <div className="flex items-center justify-between gap-3">
            <TextLinkAction type="button" arrow="" onClick={() => select(suggestion)}>
              {t('store.yesThatOne')}
            </TextLinkAction>
            <TextLinkAction type="button" onClick={() => setIsSuggestionDismissed(true)}>
              {t('store.noCreateNew')}
            </TextLinkAction>
          </div>
        </div>
      )}

      {isCreating && !isAskingAboutDuplicate && (
        <div className="grid gap-4 border border-border bg-card p-3">
          <UnderlineInput
            label={t('store.city')}
            value={city}
            onChange={(event) => setCity(event.target.value)}
          />
          <UnderlineSelect
            label={t('store.kind')}
            value={kind}
            onChange={(event) => setKind(event.target.value as StoreKind)}
            options={(Object.keys(storeKindLabels) as StoreKind[]).map((option) => ({
              value: option,
              label: storeKindLabels[option][locale],
            }))}
          />
          <OutlinedButton
            type="button"
            disabled={countryCode === '' || query.trim().length < 2}
            onClick={() =>
              onChange({
                mode: 'new',
                name: query.trim(),
                countryCode,
                city: city.trim() || undefined,
                kind,
              })
            }
          >
            {value?.mode === 'new' ? t('store.willBeCreated') : t('store.create')}
          </OutlinedButton>
        </div>
      )}

      {!isCreating && query.trim().length >= 2 && (
        <div className="justify-self-start">
          <TextLinkAction type="button" arrow="+" onClick={() => setIsCreating(true)}>
            {t('store.notListed')}
          </TextLinkAction>
        </div>
      )}
    </div>
  )
}

function describe(store: StoreDto): string {
  return [store.name, store.city]
    .filter((part): part is string => part !== null && part !== '')
    .join(', ')
}

function dedupe(stores: readonly StoreDto[]): StoreDto[] {
  const seen = new Set<string>()
  return stores.filter((store) => {
    if (seen.has(store.id)) return false
    seen.add(store.id)
    return true
  })
}

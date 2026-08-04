import {
  aftertasteLabels,
  currencyLabels,
  sugarLevelLabels,
  tanninsLabels,
  tasteCategoryLabels,
  todayInTimezone,
  wineTypeLabels,
  type Acidity,
  type Aftertaste,
  type Body,
  type Currency,
  type EntryDto,
  type SugarLevel,
  type Tannins,
  type TasteCategory,
  type WineType,
} from '@between-bubbles/contracts'
import { useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'

import { Typography } from '@/components/ui/typography'
import { useAuth, useTranslation } from '@/features/auth'
import { ApiRequestError } from '@/platform/api'
import type { MessageKey, Translate } from '@/platform/i18n'
import { countryOptions } from '../countries'
import { formatDate } from '../format'
import {
  useAromaTagsQuery,
  useCreateEntryMutation,
  useEntryQuery,
  useUpdateEntryMutation,
  useUploadPhotoMutation,
  useWeekQuery,
  useWinesQuery,
} from '../queries'
import { FlavorChips, type FlavorChipOption } from './FlavorChips'
import { NotesField } from './NotesField'
import { OutlinedButton, TextLinkAction } from './OutlinedButton'
import { PhotoUploader, type StagedPhoto } from './PhotoUploader'
import { RatingInput } from './RatingInput'
import { ScaleSlider } from './ScaleSlider'
import { UnderlineInput } from './UnderlineField'
import { StorePicker, type StoreSelection } from './StorePicker'
import { UnderlineSelect } from './UnderlineSelect'
import { VolumePicker } from './VolumePicker'
import { useWineBackground } from '../wine-background-context'

const stepKeys = [
  'form.stepBasics',
  'form.stepProfile',
  'form.stepAroma',
  'form.stepRating',
] as const satisfies ReadonlyArray<MessageKey>

const bodyOrder: readonly Body[] = ['LIGHT', 'MEDIUM', 'FULL']
const acidityOrder: readonly Acidity[] = ['LOW', 'MEDIUM', 'HIGH']

type Draft = {
  tastedOn: string
  wineMode: 'new' | 'existing'
  wineId: string
  name: string
  type: WineType
  producer: string
  originCountry: string
  region: string
  grapes: string
  vintage: string
  sugar: SugarLevel | ''
  volumeMl: number
  price: string
  currency: Currency
  purchaseCountry: string
  store: StoreSelection | undefined
  sameBottleOfId: string
  body: Body | null
  acidity: Acidity | null
  tannins: Tannins | null
  aromaTagIds: string[]
  newAromaTags: string[]
  customTag: string
  tasteCategory: TasteCategory | null
  rating: number | null
  aftertaste: Aftertaste | null
  notes: string
}

/**
 * Форма записи (ТЗ §10.6): на мобильном — четыре шага, чтобы 13 полей не превращались
 * в один бесконечный список. Обязательны только дата, вино, тип, объём и оценка —
 * всё остальное можно пропустить и вернуться позже.
 *
 * Создание и редактирование — одна и та же форма: поля совпадают полностью, и держать
 * две копии значило бы чинить каждую валидацию дважды. С `entryId` форма подставляет
 * существующую запись и сохраняет через PATCH.
 */
export function EntryForm({ entryId }: { entryId?: string } = {}) {
  const auth = useAuth()
  const { t, locale } = useTranslation()
  const navigate = useNavigate()
  const timezone = auth.user?.timezone ?? 'Asia/Tbilisi'
  const isEditing = entryId !== undefined

  const [step, setStep] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [isPrefilled, setIsPrefilled] = useState(false)
  // Фото новой записи ждут здесь: у неё ещё нет id, а грузить фото некуда без него (ТЗ §10.6).
  const [stagedPhotos, setStagedPhotos] = useState<StagedPhoto[]>([])
  // Запись создаётся ровно один раз: если упала загрузка фото, повторное сохранение
  // дозагружает оставшиеся снимки, а не заводит вторую запись.
  const [createdEntryId, setCreatedEntryId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(() => ({
    tastedOn: todayInTimezone(timezone),
    wineMode: 'new',
    wineId: '',
    name: '',
    type: 'RED',
    producer: '',
    originCountry: '',
    region: '',
    grapes: '',
    vintage: '',
    sugar: '',
    volumeMl: 150,
    price: '',
    currency: auth.user?.defaultCurrency ?? 'GEL',
    purchaseCountry: '',
    store: undefined,
    sameBottleOfId: '',
    body: null,
    acidity: null,
    tannins: null,
    aromaTagIds: [],
    newAromaTags: [],
    customTag: '',
    tasteCategory: null,
    rating: null,
    aftertaste: null,
    notes: '',
  }))

  const createEntry = useCreateEntryMutation()
  const updateEntry = useUpdateEntryMutation()
  const uploadPhoto = useUploadPhotoMutation()
  const existing = useEntryQuery(entryId)
  const aromaTags = useAromaTagsQuery()
  const catalogue = useWinesQuery({ sort: 'lastTasted', order: 'desc', limit: 100 })

  /*
   * Фон формы идёт за выбранным вином. Для нового вина тип лежит прямо в черновике,
   * для вина из справочника — у самого вина, поэтому его приходится доставать из списка:
   * черновик хранит только идентификатор.
   */
  useWineBackground(
    draft.wineMode === 'existing'
      ? catalogue.data?.items.find((wine) => wine.id === draft.wineId)?.type
      : draft.type,
  )
  const countries = useMemo(() => countryOptions(locale), [locale])

  // Кандидаты на «ту же бутылку» — записи той же недели и предыдущей: бутылку допивают
  // на следующий день, и этот день может оказаться уже за воскресеньем.
  const tastingWeek = useWeekQuery(draft.tastedOn)
  const previousWeek = useWeekQuery(shiftDays(draft.tastedOn, -7))
  const bottleCandidates = [
    ...(tastingWeek.data?.entries ?? []),
    ...(previousWeek.data?.entries ?? []),
  ].filter((candidate) => candidate.id !== entryId && !candidate.isSameBottleRepeat)

  // Выбранная бутылка подтягивает вино, цену, валюту и магазин (ТЗ §7.4).
  const sourceBottle = useEntryQuery(draft.sameBottleOfId || undefined)
  const [copiedBottleId, setCopiedBottleId] = useState('')
  if (draft.sameBottleOfId && sourceBottle.data && copiedBottleId !== draft.sameBottleOfId) {
    const source = sourceBottle.data.entry
    setCopiedBottleId(draft.sameBottleOfId)
    setDraft((current) => ({
      ...current,
      wineMode: 'existing',
      wineId: source.wine.id,
      price: source.price === null ? '' : String(source.price),
      currency: source.currency ?? current.currency,
      purchaseCountry: source.purchaseCountry ?? current.purchaseCountry,
      store: source.store === null ? undefined : { mode: 'existing', storeId: source.store.id },
    }))
  }
  const isSaving = createEntry.isPending || updateEntry.isPending || uploadPhoto.isPending

  // Подставляем запись один раз: иначе фоновый рефетч затирал бы то, что человек уже правит.
  if (isEditing && !isPrefilled && existing.data) {
    setIsPrefilled(true)
    setDraft(toDraft(existing.data.entry, auth.user?.defaultCurrency ?? 'GEL'))
  }

  const update = (patch: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...patch }))
    setError(null)
  }

  const toggle = <T,>(list: readonly T[], value: T): T[] =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value]

  /** Отправляет отложенные фото по одному и убирает из очереди те, что долетели. */
  const uploadStagedPhotos = async (targetEntryId: string) => {
    for (const photo of stagedPhotos) {
      await uploadPhoto.mutateAsync({
        entryId: targetEntryId,
        kind: photo.kind,
        bytes: photo.bytes,
      })
      setStagedPhotos((current) => current.filter((item) => item.id !== photo.id))
    }
  }

  const submit = async () => {
    if (draft.wineMode === 'new' && draft.name.trim().length === 0) {
      setError(t('form.nameRequired'))
      setStep(0)
      return
    }
    if (draft.wineMode === 'existing' && draft.wineId === '') {
      setError(t('form.winePickRequired'))
      setStep(0)
      return
    }
    if (draft.rating === null) {
      setError(t('form.ratingRequired'))
      return
    }

    const payload = {
      wine:
        draft.wineMode === 'existing'
          ? ({ mode: 'existing', wineId: draft.wineId } as const)
          : ({
              mode: 'new',
              wine: {
                name: draft.name,
                type: draft.type,
                producer: draft.producer,
                region: draft.region,
                originCountry: draft.originCountry || undefined,
                grapes: splitGrapes(draft.grapes),
                vintage: draft.vintage === '' ? undefined : Number(draft.vintage),
                sugar: draft.sugar === '' ? undefined : draft.sugar,
              },
            } as const),
      tastedOn: draft.tastedOn,
      volumeMl: draft.volumeMl,
      rating: draft.rating,
      price: draft.price === '' ? undefined : Number(draft.price),
      // Валюта уезжает только вместе с ценой — иначе схема справедливо ругается.
      currency: draft.price === '' ? undefined : draft.currency,
      purchaseCountry: draft.purchaseCountry || undefined,
      store: draft.store,
      sameBottleOfId: draft.sameBottleOfId || undefined,
      body: draft.body ?? undefined,
      acidity: draft.acidity ?? undefined,
      tannins: draft.tannins ?? undefined,
      tasteCategory: draft.tasteCategory ?? undefined,
      aftertaste: draft.aftertaste ?? undefined,
      notes: draft.notes || undefined,
      aromaTagIds: draft.aromaTagIds,
      newAromaTags: draft.newAromaTags,
    }

    // Держим id рядом, а не только в состоянии: в catch состояние ещё старое, и по нему
    // не отличить «запись не сохранилась» от «сохранилась, но фото не долетело».
    let savedId = createdEntryId

    try {
      if (entryId !== undefined) {
        await updateEntry.mutateAsync({ entryId, payload })
        await navigate({ to: '/entries/$entryId', params: { entryId } })
        return
      }

      savedId ??= (await createEntry.mutateAsync(payload)).entry.id
      setCreatedEntryId(savedId)
      await uploadStagedPhotos(savedId)
      await navigate({ to: '/' })
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError
          ? caught.message
          : savedId === null
            ? t('form.saveFailed')
            : t('photos.uploadFailed'),
      )
    }
  }

  return (
    <div className="grid gap-8 p-4 pb-10">
      <header className="grid gap-2">
        <Typography variant="capsLabel" tone="muted">
          {t('form.step', {
            step: step + 1,
            total: stepKeys.length,
            name: t(stepKeys[step]!),
          })}
        </Typography>
        <div className="flex gap-1" aria-hidden>
          {stepKeys.map((name, index) => (
            <span
              key={name}
              className={index <= step ? 'h-1 flex-1 bg-accent-b' : 'h-1 flex-1 bg-border'}
            />
          ))}
        </div>
      </header>

      {step === 0 && (
        <section className="grid gap-6 border border-border p-4">
          <UnderlineInput
            label={t('form.date')}
            type="date"
            max={todayInTimezone(timezone)}
            value={draft.tastedOn}
            onChange={(event) => update({ tastedOn: event.target.value })}
          />

          <FlavorChips
            label={t('form.wine')}
            tone="a"
            options={[
              { id: 'new', label: t('form.wineNew') },
              { id: 'existing', label: t('form.wineExisting') },
            ]}
            selected={[draft.wineMode]}
            onToggle={(id) => update({ wineMode: id as Draft['wineMode'] })}
          />

          {draft.wineMode === 'existing' ? (
            <UnderlineSelect
              label={t('form.fromCatalogue')}
              placeholder={t('form.pickWine')}
              value={draft.wineId}
              onChange={(event) => update({ wineId: event.target.value })}
              options={(catalogue.data?.items ?? []).map((wine) => ({
                value: wine.id,
                label: `${wine.name} · ${wineTypeLabels[wine.type][locale]}`,
              }))}
              hint={
                catalogue.data?.items.length === 0
                  ? t('form.catalogueEmpty')
                  : undefined
              }
            />
          ) : (
            <>
              <UnderlineInput
                label={t('form.name')}
                value={draft.name}
                placeholder="Saperavi"
                onChange={(event) => update({ name: event.target.value })}
              />
              <UnderlineSelect
                label={t('form.type')}
                value={draft.type}
                onChange={(event) => update({ type: event.target.value as WineType })}
                options={(Object.keys(wineTypeLabels) as WineType[]).map((type) => ({
                  value: type,
                  label: wineTypeLabels[type][locale],
                }))}
              />
              <UnderlineInput
                label={t('form.producer')}
                value={draft.producer}
                onChange={(event) => update({ producer: event.target.value })}
              />
              <UnderlineSelect
                label={t('form.originCountry')}
                placeholder={t('form.notSet')}
                value={draft.originCountry}
                onChange={(event) => update({ originCountry: event.target.value })}
                options={countries.map((country) => ({
                  value: country.code,
                  label: `${country.flag} ${country.name}`,
                }))}
              />
              <UnderlineInput
                label={t('form.region')}
                value={draft.region}
                onChange={(event) => update({ region: event.target.value })}
              />
              <UnderlineInput
                label={t('form.grapes')}
                value={draft.grapes}
                placeholder={t('form.grapesPlaceholder')}
                hint={t('form.grapesHint')}
                onChange={(event) => update({ grapes: event.target.value })}
              />
              <UnderlineInput
                label={t('form.vintage')}
                type="number"
                inputMode="numeric"
                value={draft.vintage}
                onChange={(event) => update({ vintage: event.target.value })}
              />
              <UnderlineSelect
                label={t('form.sugar')}
                placeholder={t('form.sugarNotSet')}
                value={draft.sugar}
                onChange={(event) => update({ sugar: event.target.value as SugarLevel | '' })}
                options={(Object.keys(sugarLevelLabels) as SugarLevel[]).map((sugar) => ({
                  value: sugar,
                  label: sugarLevelLabels[sugar][locale],
                }))}
              />
            </>
          )}

          <VolumePicker
            label={t('form.volume')}
            value={draft.volumeMl}
            onChange={(volumeMl) => update({ volumeMl })}
          />

          <UnderlineInput
            label={t('form.price')}
            type="number"
            inputMode="decimal"
            value={draft.price}
            hint={t('form.priceHint')}
            onChange={(event) => update({ price: event.target.value })}
          />

          {draft.price !== '' && (
            <UnderlineSelect
              label={t('form.currency')}
              value={draft.currency}
              onChange={(event) => update({ currency: event.target.value as Currency })}
              options={(Object.keys(currencyLabels) as Currency[]).map((currency) => ({
                value: currency,
                label: currencyLabels[currency][locale],
              }))}
            />
          )}

          <UnderlineSelect
            label={t('form.purchaseCountry')}
            placeholder={t('form.notSet')}
            value={draft.purchaseCountry}
            onChange={(event) => update({ purchaseCountry: event.target.value })}
            options={countries.map((country) => ({
              value: country.code,
              label: `${country.flag} ${country.name}`,
            }))}
          />

          <StorePicker
            value={draft.store}
            onChange={(store) => update({ store })}
            countryCode={draft.purchaseCountry}
            locale={locale}
          />

          {bottleCandidates.length > 0 && (
            <UnderlineSelect
              label={t('form.sameBottle')}
              placeholder={t('form.sameBottleNew')}
              value={draft.sameBottleOfId}
              hint={t('form.sameBottleHint')}
              onChange={(event) => update({ sameBottleOfId: event.target.value })}
              options={bottleCandidates.map((candidate) => ({
                value: candidate.id,
                label: `${candidate.wineName} · ${formatDate(candidate.tastedOn, locale)}`,
              }))}
            />
          )}
        </section>
      )}

      {step === 1 && (
        <section className="grid gap-8 border border-border p-4">
          <ScaleSlider
            label={t('entry.body')}
            options={bodyOrder}
            poles={[t('form.bodyLight'), t('form.bodyFull')]}
            value={draft.body}
            onChange={(body) => update({ body })}
          />
          <ScaleSlider
            label={t('entry.acidity')}
            options={acidityOrder}
            poles={[t('form.acidityLow'), t('form.acidityHigh')]}
            value={draft.acidity}
            onChange={(acidity) => update({ acidity })}
          />
          {/*
            Танины — это не шкала: «не применимо» не лежит между «шёлковыми» и «агрессивными».
            Поэтому здесь чипы, а слайдеры остаются там, где значения действительно упорядочены.
          */}
          <FlavorChips
            label={t('entry.tannins')}
            tone="b"
            options={(Object.keys(tanninsLabels) as Tannins[]).map((value) => ({
              id: value,
              label: tanninsLabels[value][locale],
            }))}
            selected={draft.tannins ? [draft.tannins] : []}
            onToggle={(id) =>
              update({ tannins: draft.tannins === id ? null : (id as Tannins) })
            }
          />
          <Typography variant="caption" tone="muted">
            {t('form.profileOptional')}
          </Typography>
        </section>
      )}

      {step === 2 && (
        <section className="grid gap-8 border border-border p-4">
          <FlavorChips
            label={t('entry.aroma')}
            tone="a"
            options={aromaOptions(aromaTags.data?.items ?? [], locale)}
            selected={draft.aromaTagIds}
            onToggle={(id) => update({ aromaTagIds: toggle(draft.aromaTagIds, id) })}
          />

          {draft.newAromaTags.length > 0 && (
            <FlavorChips
              label={t('form.myTags')}
              tone="a"
              options={draft.newAromaTags.map((name) => ({ id: name, label: name }))}
              selected={draft.newAromaTags}
              onToggle={(name) => update({ newAromaTags: toggle(draft.newAromaTags, name) })}
            />
          )}

          <div className="grid gap-3">
            <UnderlineInput
              label={t('form.customTag')}
              value={draft.customTag}
              placeholder={t('form.customTagPlaceholder')}
              hint={t('form.customTagHint')}
              onChange={(event) => update({ customTag: event.target.value })}
            />
            <div className="justify-self-start">
              <TextLinkAction
                type="button"
                arrow="+"
                onClick={() => {
                  const name = draft.customTag.trim()
                  if (name === '' || draft.newAromaTags.includes(name)) return
                  update({ newAromaTags: [...draft.newAromaTags, name], customTag: '' })
                }}
              >
                {t('form.addTag')}
              </TextLinkAction>
            </div>
          </div>

          <FlavorChips
            label={t('entry.tasteCategory')}
            tone="b"
            options={(Object.keys(tasteCategoryLabels) as TasteCategory[]).map((category) => ({
              id: category,
              label: `${category} — ${tasteCategoryLabels[category][locale]}`,
            }))}
            selected={draft.tasteCategory ? [draft.tasteCategory] : []}
            onToggle={(id) =>
              update({
                tasteCategory: draft.tasteCategory === id ? null : (id as TasteCategory),
              })
            }
          />
          <Typography variant="caption" tone="muted">
            {t('form.categoryHint')}
          </Typography>
        </section>
      )}

      {step === 3 && (
        <section className="grid gap-8 border border-border p-4">
          <RatingInput
            label={t('form.rating')}
            value={draft.rating}
            onChange={(rating) => update({ rating })}
          />
          <FlavorChips
            label={t('entry.aftertaste')}
            tone="b"
            options={(Object.keys(aftertasteLabels) as Aftertaste[]).map((value) => ({
              id: value,
              label: aftertasteLabels[value][locale],
            }))}
            selected={draft.aftertaste ? [draft.aftertaste] : []}
            onToggle={(id) =>
              update({ aftertaste: draft.aftertaste === id ? null : (id as Aftertaste) })
            }
          />
          <NotesField
            label={t('entry.notes')}
            rows={6}
            value={draft.notes}
            placeholder={t('form.notesPlaceholder')}
            onChange={(notes) => update({ notes })}
          />

          {/*
            Фото в конце формы, а не в «Основном»: бутылку фотографируют, когда всё остальное
            уже записано, и первый шаг и без того самый длинный (ТЗ §10.6).
          */}
          {entryId === undefined ? (
            <PhotoUploader staged={stagedPhotos} onStagedChange={setStagedPhotos} />
          ) : (
            existing.data && (
              <PhotoUploader entryId={entryId} photos={existing.data.entry.photos} />
            )
          )}
        </section>
      )}

      {error && (
        <Typography role="alert" tone="destructive">
          {error}
        </Typography>
      )}

      <footer className="grid gap-4">
        {step === stepKeys.length - 1 ? (
          <OutlinedButton
            type="button"
            disabled={isSaving}
            onClick={() => void submit()}
          >
            {saveLabel(t, { isSaving, isEditing, isRetryingPhotos: createdEntryId !== null })}
          </OutlinedButton>
        ) : (
          <OutlinedButton type="button" onClick={() => setStep(step + 1)}>
            {t('form.next')}
          </OutlinedButton>
        )}

        <div className="flex items-center justify-between">
          {step > 0 ? (
            <TextLinkAction type="button" arrow="" onClick={() => setStep(step - 1)}>
              {t('form.back')}
            </TextLinkAction>
          ) : (
            <TextLinkAction
              type="button"
              arrow=""
              onClick={() =>
                void navigate(
                  entryId === undefined
                    ? { to: '/' }
                    : { to: '/entries/$entryId', params: { entryId } },
                )
              }
            >
              {t('form.cancel')}
            </TextLinkAction>
          )}

          {step < stepKeys.length - 1 && (
            <TextLinkAction type="button" onClick={() => setStep(stepKeys.length - 1)}>
              {t('form.toRating')}
            </TextLinkAction>
          )}
        </div>
      </footer>
    </div>
  )
}

/**
 * Подпись главной кнопки. Отдельный случай — запись уже создана, а фото не долетело:
 * тогда кнопка честно обещает повтор загрузки, а не «сохранить запись» ещё раз.
 */
function saveLabel(
  t: Translate,
  state: { isSaving: boolean; isEditing: boolean; isRetryingPhotos: boolean },
): string {
  if (state.isSaving) return t('form.saving')
  if (state.isRetryingPhotos) return t('form.retryPhotos')
  return state.isEditing ? t('form.saveChanges') : t('form.save')
}

function aromaOptions(
  tags: ReadonlyArray<{ id: string; nameRu: string; nameEn: string | null }>,
  locale: 'ru' | 'en',
): FlavorChipOption[] {
  return tags.map((tag) => ({
    id: tag.id,
    label: locale === 'en' ? (tag.nameEn ?? tag.nameRu) : tag.nameRu,
  }))
}

/** Существующая запись → черновик формы. Пустые значения остаются пустыми строками. */
function toDraft(entry: EntryDto, fallbackCurrency: Draft['currency']): Draft {
  return {
    tastedOn: entry.tastedOn,
    // Вино уже существует в справочнике, поэтому правим только впечатления от него.
    wineMode: 'existing',
    wineId: entry.wine.id,
    name: entry.wine.name,
    type: entry.wine.type,
    producer: entry.wine.producer ?? '',
    originCountry: entry.wine.originCountry ?? '',
    region: entry.wine.region ?? '',
    grapes: entry.wine.grapes.join(', '),
    vintage: entry.wine.vintage === null ? '' : String(entry.wine.vintage),
    sugar: entry.wine.sugar ?? '',
    volumeMl: entry.volumeMl,
    price: entry.price === null ? '' : String(entry.price),
    currency: entry.currency ?? fallbackCurrency,
    purchaseCountry: entry.purchaseCountry ?? '',
    store: entry.store === null ? undefined : { mode: 'existing', storeId: entry.store.id },
    sameBottleOfId: entry.sameBottleOfId ?? '',
    body: entry.body,
    acidity: entry.acidity,
    tannins: entry.tannins,
    aromaTagIds: entry.aromas.map((aroma) => aroma.id),
    newAromaTags: [],
    customTag: '',
    tasteCategory: entry.tasteCategory,
    rating: entry.rating,
    aftertaste: entry.aftertaste,
    notes: entry.notes ?? '',
  }
}

/** Сдвиг календарной даты без часовых поясов: у даты дегустации нет времени суток. */
function shiftDays(date: string, days: number): string {
  const shifted = new Date(`${date}T00:00:00.000Z`)
  shifted.setUTCDate(shifted.getUTCDate() + days)
  return shifted.toISOString().slice(0, 10)
}

function splitGrapes(value: string): string[] {
  return value
    .split(',')
    .map((grape) => grape.trim())
    .filter((grape) => grape.length > 0)
}

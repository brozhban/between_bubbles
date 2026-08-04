import {
  acidityLabels,
  aftertasteLabels,
  bodyLabels,
  currencySymbols,
  sugarLevelLabels,
  tanninsLabels,
  tasteCategoryLabels,
  wineTypeLabels,
} from '@between-bubbles/contracts'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

import { Spinner } from '@/components/ui/spinner'
import { Typography } from '@/components/ui/typography'
import { useTranslation } from '@/features/auth'
import { countryName } from '../countries'
import { formatDate } from '../format'
import { useEntryQuery, useTrashEntryMutation } from '../queries'
import { OutlinedButton, TextLinkAction } from './OutlinedButton'
import { SharePanel } from './SharePanel'
import { PhotoUploader } from './PhotoUploader'
import { RatingPill } from './RatingPill'

/**
 * Карточка записи: здесь раскрываются заметки и все характеристики, которых нет в списке
 * недели. Отсюда же запись редактируется и уходит в корзину (ТЗ §7.6).
 */
export function EntryScreen({ entryId }: { entryId: string }) {
  const { t, locale } = useTranslation()
  const navigate = useNavigate()
  const entry = useEntryQuery(entryId)
  const trashEntry = useTrashEntryMutation()
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)

  if (entry.isPending) {
    return (
      <div className="flex items-center gap-3 p-6">
        <Spinner />
        <Typography variant="bodySm" tone="muted">
          {t('entry.loading')}
        </Typography>
      </div>
    )
  }

  if (entry.isError) {
    return (
      <div className="grid gap-4 p-6" role="alert">
        <Typography variant="screenTitle">{t('entry.notFound')}</Typography>
        <Typography tone="muted">
          {t('entry.notFoundHint')}
        </Typography>
        <OutlinedButton type="button" onClick={() => void navigate({ to: '/' })}>
          {t('entry.toWeek')}
        </OutlinedButton>
      </div>
    )
  }

  const data = entry.data.entry

  return (
    <article className="grid gap-8 p-4 pb-10">
      <header className="grid gap-3">
        <Typography variant="capsLabel" tone="muted">
          {formatDate(data.tastedOn, locale)}
        </Typography>
        <div className="flex items-start justify-between gap-4">
          <Typography variant="wineNameLg">{data.wine.name}</Typography>
          <RatingPill value={data.rating} />
        </div>
        <Typography asChild variant="capsMeta" tone="muted">
          <Link to="/wines/$wineId" params={{ wineId: data.wine.id }}>
            {`${wineTypeLabels[data.wine.type][locale]} · ${t('entry.allTastings')}`}
          </Link>
        </Typography>
      </header>

      <section className="grid gap-4 border border-border bg-card p-4">
        <Facts
          emptyLabel={t('entry.emptyFacts')}
          rows={[
            [
              t('entry.volume'),
              t('entry.volumeValue', { glasses: data.glasses, ml: data.volumeMl }),
            ],
            [t('entry.producer'), data.wine.producer],
            [
              t('entry.origin'),
              joinParts([
                data.wine.originCountry ? countryName(data.wine.originCountry, locale) : null,
                data.wine.region,
              ]),
            ],
            [t('entry.grapes'), data.wine.grapes.length > 0 ? data.wine.grapes.join(', ') : null],
            [t('entry.vintage'), data.wine.vintage === null ? null : String(data.wine.vintage)],
            [t('entry.sugar'), data.wine.sugar ? sugarLevelLabels[data.wine.sugar][locale] : null],
            [
              t('entry.price'),
              data.price === null || data.currency === null
                ? null
                : `${Math.round(data.price)} ${currencySymbols[data.currency]}`,
            ],
            [
              t('entry.purchaseCountry'),
              data.purchaseCountry ? countryName(data.purchaseCountry, locale) : null,
            ],
            [t('entry.store'), data.store?.name ?? null],
          ]}
        />
      </section>

      <section className="grid gap-4 border border-border bg-card p-4">
        <Facts
          emptyLabel={t('entry.emptyFacts')}
          rows={[
            [t('entry.body'), data.body ? bodyLabels[data.body][locale] : null],
            [t('entry.acidity'), data.acidity ? acidityLabels[data.acidity][locale] : null],
            [t('entry.tannins'), data.tannins ? tanninsLabels[data.tannins][locale] : null],
            [
              t('entry.aftertaste'),
              data.aftertaste ? aftertasteLabels[data.aftertaste][locale] : null,
            ],
            [
              t('entry.tasteCategory'),
              data.tasteCategory
                ? `${data.tasteCategory} — ${tasteCategoryLabels[data.tasteCategory][locale]}`
                : null,
            ],
            [
              t('entry.aroma'),
              data.aromas.length > 0
                ? data.aromas
                    .map((aroma) => (locale === 'en' ? (aroma.nameEn ?? aroma.nameRu) : aroma.nameRu))
                    .join(', ')
                : null,
            ],
          ]}
        />
      </section>

      <PhotoUploader entryId={entryId} photos={data.photos} />

      {data.notes && (
        <section className="grid gap-2">
          <Typography variant="capsLabel" tone="muted">
            {t('entry.notes')}
          </Typography>
          <Typography variant="diaryNote">{data.notes}</Typography>
        </section>
      )}

      {data.sameBottleOfId !== null && (
        <Typography variant="caption" tone="muted">
          {t('entry.sameBottleNote')}
        </Typography>
      )}

      <SharePanel entryId={entryId} />

      <footer className="grid gap-4">
        <OutlinedButton
          type="button"
          onClick={() => void navigate({ to: '/entries/$entryId/edit', params: { entryId } })}
        >
          {t('entry.edit')}
        </OutlinedButton>

        {isConfirmingDelete ? (
          <div className="grid gap-3 border border-border bg-card p-4">
            <Typography variant="bodySm">
              {t('entry.deleteConfirm')}
            </Typography>
            <div className="flex items-center justify-between">
              <TextLinkAction
                type="button"
                arrow=""
                onClick={() => setIsConfirmingDelete(false)}
              >
                {t('entry.keep')}
              </TextLinkAction>
              <TextLinkAction
                type="button"
                onClick={() => {
                  trashEntry.mutate(entryId, {
                    onSuccess: () => void navigate({ to: '/' }),
                  })
                }}
              >
                {trashEntry.isPending ? t('entry.deleting') : t('entry.toTrash')}
              </TextLinkAction>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <TextLinkAction type="button" arrow="" onClick={() => void navigate({ to: '/' })}>
              {t('entry.backToWeek')}
            </TextLinkAction>
            <TextLinkAction type="button" onClick={() => setIsConfirmingDelete(true)}>
              {t('entry.delete')}
            </TextLinkAction>
          </div>
        )}
      </footer>
    </article>
  )
}

/** Таблица «лейбл — значение»; незаполненные поля просто не показываются. */
function Facts({
  rows,
  emptyLabel,
}: {
  rows: ReadonlyArray<[string, string | null]>
  emptyLabel: string
}) {
  const filled = rows.filter((row): row is [string, string] => row[1] !== null && row[1] !== '')

  if (filled.length === 0) {
    return (
      <Typography variant="bodySm" tone="muted">
        {emptyLabel}
      </Typography>
    )
  }

  return (
    <dl className="grid gap-3">
      {filled.map(([label, value]) => (
        <div key={label} className="grid gap-1">
          <Typography asChild variant="capsLabel" tone="muted">
            <dt>{label}</dt>
          </Typography>
          <Typography asChild variant="fieldValue">
            <dd>{value}</dd>
          </Typography>
        </div>
      ))}
    </dl>
  )
}

function joinParts(parts: ReadonlyArray<string | null>): string | null {
  const filled = parts.filter((part): part is string => part !== null && part !== '')
  return filled.length > 0 ? filled.join(', ') : null
}


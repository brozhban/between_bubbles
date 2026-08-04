import {
  sugarLevelLabels,
  wineTypeLabels,
  type Locale,
} from '@between-bubbles/contracts'
import { useNavigate } from '@tanstack/react-router'

import { Spinner } from '@/components/ui/spinner'
import { Typography } from '@/components/ui/typography'
import { useTranslation } from '@/features/auth'
import { countryName } from '../countries'
import { formatRating } from '../format'
import type { Translate } from '@/platform/i18n'
import { useWineQuery } from '../queries'
import { EntryRow } from './EntryRow'
import { OutlinedButton, TextLinkAction } from './OutlinedButton'

/**
 * Карточка вина (ТЗ §10.7): атрибуты, средний рейтинг по всем дегустациям и их история.
 * Средний рейтинг существует только здесь — усреднять оценки разных вин запрещено (ТЗ §8.2).
 */
export function WineScreen({ wineId }: { wineId: string }) {
  const { t, locale } = useTranslation()
  const navigate = useNavigate()
  const wine = useWineQuery(wineId)

  if (wine.isPending) {
    return (
      <div className="flex items-center gap-3 p-6">
        <Spinner />
        <Typography variant="bodySm" tone="muted">
          {t('wine.loading')}
        </Typography>
      </div>
    )
  }

  if (wine.isError) {
    return (
      <div className="grid gap-4 p-6" role="alert">
        <Typography variant="screenTitle">{t('wine.notFound')}</Typography>
        <OutlinedButton type="button" onClick={() => void navigate({ to: '/wines' })}>
          {t('wine.toCatalogue')}
        </OutlinedButton>
      </div>
    )
  }

  const { wine: data, averageRating, tastings } = wine.data

  return (
    <article className="grid gap-8 p-4 pb-10">
      <header className="grid gap-3">
        <Typography variant="capsLabel" tone="muted">
          {wineTypeLabels[data.type][locale]}
        </Typography>
        <Typography variant="wineNameLg">{data.name}</Typography>
        <Typography variant="capsMeta" tone="muted">
          {subtitle(data, locale, t)}
        </Typography>
      </header>

      <section className="grid grid-cols-2 gap-4 border border-border p-4">
        <div className="grid gap-1">
          <Typography variant="capsLabel" tone="muted">
            {t('wine.averageRating')}
          </Typography>
          <Typography variant="displayNumber">
            {averageRating === null ? '—' : formatRating(averageRating)}
          </Typography>
        </div>
        <div className="grid gap-1">
          <Typography variant="capsLabel" tone="muted">
            {t('wine.tastingCount')}
          </Typography>
          <Typography variant="displayNumber">{String(tastings.length)}</Typography>
        </div>
      </section>

      <section className="grid gap-3">
        <Typography variant="capsLabel" tone="muted">
          {t('wine.history')}
        </Typography>
        {tastings.length === 0 ? (
          <Typography tone="muted">
            {t('wine.historyEmpty')}
          </Typography>
        ) : (
          <div className="grid">
            {tastings.map((entry) => (
              <EntryRow key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </section>

      <TextLinkAction type="button" arrow="" onClick={() => void navigate({ to: '/wines' })}>
        {t('wine.backToCatalogue')}
      </TextLinkAction>
    </article>
  )
}

function subtitle(
  wine: {
    producer: string | null
    originCountry: string | null
    region: string | null
    vintage: number | null
    sugar: keyof typeof sugarLevelLabels | null
  },
  locale: Locale,
  t: Translate,
): string {
  const parts = [
    wine.producer,
    wine.originCountry ? countryName(wine.originCountry, locale) : null,
    wine.region,
    wine.vintage === null ? null : String(wine.vintage),
    wine.sugar ? sugarLevelLabels[wine.sugar][locale] : null,
  ].filter((part): part is string => part !== null && part !== '')

  return parts.length > 0 ? parts.join(' · ') : t('wine.noExtraData')
}

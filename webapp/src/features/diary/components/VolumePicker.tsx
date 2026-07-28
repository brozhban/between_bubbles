import { BOTTLE_ML, GLASS_ML } from '@between-bubbles/contracts'
import { useState } from 'react'

import { Typography } from '@/components/ui/typography'
import { useTranslation } from '@/features/auth'
import { cn } from '@/lib/utils'
import { underlineControlClassName } from '../field-styles'
import { UnderlineField } from './UnderlineField'

/** Быстрые кнопки объёма из прототипа (ТЗ §7.2); хранится всё равно в миллилитрах. */
const presets = [
  { ml: GLASS_ML, label: '🍷' },
  { ml: GLASS_ML * 2, label: '🍷🍷' },
  { ml: GLASS_ML * 3, label: '🍷🍷🍷' },
  { ml: BOTTLE_ML, label: '🍾' },
] as const

export function VolumePicker({
  value,
  onChange,
  label,
  className,
}: {
  value: number
  onChange: (volumeMl: number) => void
  label: string
  className?: string
}) {
  const { t } = useTranslation()
  const [isCustom, setIsCustom] = useState(
    () => !presets.some((preset) => preset.ml === value),
  )

  return (
    <div className={cn('grid gap-3', className)}>
      <Typography variant="capsLabel" tone="muted">
        {label}
      </Typography>

      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => {
          const isSelected = !isCustom && value === preset.ml

          return (
            <button
              key={preset.ml}
              type="button"
              aria-pressed={isSelected}
              onClick={() => {
                setIsCustom(false)
                onChange(preset.ml)
              }}
              className={cn(
                'border border-border px-3 py-2',
                isSelected ? 'bg-accent-b' : 'bg-transparent hover:border-foreground',
              )}
            >
              <Typography
                variant="capsLabel"
                className={isSelected ? 'text-accent-ink' : undefined}
              >
                {preset.label}
              </Typography>
            </button>
          )
        })}

        <button
          type="button"
          aria-pressed={isCustom}
          onClick={() => setIsCustom(true)}
          className={cn(
            'border border-border px-3 py-2',
            isCustom ? 'bg-accent-b' : 'bg-transparent hover:border-foreground',
          )}
        >
          <Typography variant="capsLabel" className={isCustom ? 'text-accent-ink' : undefined}>
            {t('form.volumeOther')}
          </Typography>
        </button>
      </div>

      {isCustom && (
        <UnderlineField label={t('form.millilitres')}>
          <Typography asChild variant="fieldValue">
            <input
              type="number"
              min={1}
              max={5000}
              step={10}
              value={value}
              onChange={(event) => onChange(Number(event.target.value))}
              className={underlineControlClassName}
            />
          </Typography>
        </UnderlineField>
      )}

      <Typography variant="caption" tone="muted">
        {t('entry.volumeValue', { glasses: glassesOf(value), ml: value })}
      </Typography>
    </div>
  )
}

function glassesOf(volumeMl: number): number {
  return Math.round((volumeMl / GLASS_ML) * 2) / 2
}

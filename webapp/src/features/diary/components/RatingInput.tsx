import { useId } from 'react'

import { Typography } from '@/components/ui/typography'
import { cn } from '@/lib/utils'
import { formatRating } from '../format'

/** 10 значений шкалы 0.5–5.0: тик на каждые полбалла. */
const segments = Array.from({ length: 10 }, (_, index) => index)

/**
 * Оценка как аудио-скраббер, а не звёзды (DESIGN.md → Rating Input).
 *
 * Под сегментами лежит настоящий `input[type=range]`: он бесплатно даёт перетаскивание,
 * клавиатуру и озвучку скринридером, а видимая часть остаётся печатной — 10 тиков и
 * крупное число серифом.
 */
export function RatingInput({
  value,
  onChange,
  label,
  className,
}: {
  value: number | null
  onChange: (value: number) => void
  label: string
  className?: string
}) {
  const inputId = useId()
  const filledSteps = value === null ? 0 : Math.round(value * 2)

  return (
    <div className={cn('grid gap-3', className)}>
      <Typography asChild variant="capsLabel" tone="muted">
        <label htmlFor={inputId}>{label}</label>
      </Typography>

      <Typography variant="displayNumber" align="center">
        {value === null ? '—' : formatRating(value)}
      </Typography>

      <div className="relative h-6">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 gap-px">
          {segments.map((index) => (
            <span
              key={index}
              className={cn(
                'h-1 flex-1 transition-colors',
                index < filledSteps ? 'bg-accent-b' : 'bg-border',
              )}
            />
          ))}
        </div>
        <input
          id={inputId}
          type="range"
          min={0.5}
          max={5}
          step={0.5}
          value={value ?? 0.5}
          aria-label={label}
          aria-valuetext={value === null ? undefined : formatRating(value)}
          onChange={(event) => onChange(Number(event.target.value))}
          className="absolute inset-0 w-full cursor-pointer opacity-0"
        />
      </div>
    </div>
  )
}

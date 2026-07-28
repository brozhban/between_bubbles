import { Typography } from '@/components/ui/typography'
import { cn } from '@/lib/utils'
import { formatRating } from '../format'

/**
 * Компактная плашка рейтинга (DESIGN.md → Rating Pill).
 * Цвет фона кодирует диапазон, поэтому оценку видно до чтения числа.
 */
export function RatingPill({ value, className }: { value: number; className?: string }) {
  return (
    <span
      className={cn('inline-flex min-w-10 items-center justify-center px-2 py-1', toneFor(value), className)}
      data-slot="rating-pill"
    >
      <Typography variant="control" className="text-accent-ink">
        {formatRating(value)}
      </Typography>
    </span>
  )
}

function toneFor(value: number): string {
  if (value >= 4) return 'bg-accent-b'
  if (value >= 2.5) return 'bg-accent-a'
  return 'bg-border'
}

import type { WeekDayDto } from '@between-bubbles/contracts'

import { Typography } from '@/components/ui/typography'
import { useTranslation } from '@/features/auth'
import { weekdayShortLabel } from '../weekdays'
import { cn } from '@/lib/utils'

/** Календарь недели (ТЗ §9): число бокалов в ячейке = число записей этого дня. */
export function WeekCalendar({
  days,
  onSelectDay,
  className,
}: {
  days: readonly WeekDayDto[]
  onSelectDay?: (date: string) => void
  className?: string
}) {
  const { locale } = useTranslation()
  const Element = onSelectDay ? 'button' : 'div'

  return (
    <div className={cn('grid grid-cols-7 border border-border bg-card', className)}>
      {days.map((day) => (
        // Обработчика выбора дня никто не передаёт, поэтому все семь ячеек — это семь
        // заблокированных кнопок: клавиатура на них останавливается, скринридер объявляет
        // «button, dimmed». Пока выбор дня не понадобился продукту, это обычная разметка.
        <Element
          key={day.date}
          {...(onSelectDay
            ? { type: 'button' as const, onClick: () => onSelectDay(day.date) }
            : {})}
          className={cn(
            'flex min-h-20 flex-col items-center gap-2 border-r border-border p-2 last:border-r-0',
            onSelectDay && 'hover:bg-card',
          )}
        >
          <Typography variant="capsPole" tone="muted">
            {weekdayShortLabel(day.weekday, locale)}
          </Typography>
          <Typography variant="bodyXs" tone="muted">
            {day.date.slice(8)}
          </Typography>
          <Typography variant="bodyXs" aria-label={`${day.entryCount}`}>
            {'🍷'.repeat(Math.min(day.entryCount, 4))}
          </Typography>
        </Element>
      ))}
    </div>
  )
}

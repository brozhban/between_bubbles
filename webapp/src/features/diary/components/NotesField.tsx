import { useId } from 'react'

import { Typography } from '@/components/ui/typography'
import { cn } from '@/lib/utils'

/**
 * Заметки (DESIGN.md → Notes Field): сериф и воздух между строк, чтобы блок читался
 * как страница дневника, а не как поле формы.
 */
export function NotesField({
  label,
  value,
  onChange,
  placeholder,
  rows = 4,
  className,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
  className?: string
}) {
  const inputId = useId()

  return (
    <div className={cn('grid gap-2', className)}>
      <Typography asChild variant="capsLabel" tone="muted">
        <label htmlFor={inputId}>{label}</label>
      </Typography>
      <Typography asChild variant="diaryNote">
        <textarea
          id={inputId}
          rows={rows}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className="w-full resize-y border-0 border-b border-border bg-transparent pb-2 outline-none focus:border-b-2 focus:border-foreground"
        />
      </Typography>
    </div>
  )
}

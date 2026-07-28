import { useId, type ComponentProps, type ReactNode } from 'react'

import { Typography } from '@/components/ui/typography'
import { cn } from '@/lib/utils'
import { underlineControlClassName } from '../field-styles'

/**
 * Поле-подчёркивание (DESIGN.md → Underline Input): без бокса, без фона, без радиуса.
 * Оборачивает произвольный контрол, чтобы селекты и числовые поля выглядели так же,
 * как текстовые, а не как чужие элементы.
 */
export function UnderlineField({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: string
  htmlFor?: string
  hint?: string
  error?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('grid gap-2', className)}>
      <Typography asChild variant="capsLabel" tone="muted">
        <label htmlFor={htmlFor}>{label}</label>
      </Typography>
      {children}
      {hint && !error && (
        <Typography variant="caption" tone="muted">
          {hint}
        </Typography>
      )}
      {error && (
        <Typography role="alert" variant="caption" tone="destructive">
          {error}
        </Typography>
      )}
    </div>
  )
}

export function UnderlineInput({
  label,
  hint,
  error,
  className,
  ...props
}: {
  label: string
  hint?: string
  error?: string
} & ComponentProps<'input'>) {
  const generatedId = useId()
  const inputId = props.id ?? generatedId

  return (
    <UnderlineField label={label} htmlFor={inputId} hint={hint} error={error} className={className}>
      <Typography asChild variant="fieldValue">
        <input {...props} id={inputId} className={underlineControlClassName} />
      </Typography>
    </UnderlineField>
  )
}

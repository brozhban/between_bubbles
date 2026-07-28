import type { ComponentProps } from 'react'

import { Typography } from '@/components/ui/typography'
import { cn } from '@/lib/utils'

/**
 * Единственный тип CTA в системе (DESIGN.md → Outlined Action Button):
 * контур вместо заливки, чтобы кнопка не спорила с тёплой бумагой фона.
 */
export function OutlinedButton({
  children,
  className,
  ...props
}: ComponentProps<'button'>) {
  return (
    <button
      {...props}
      className={cn(
        'w-full border border-foreground bg-transparent px-4 py-[14px] transition-colors',
        'hover:bg-foreground/5 disabled:opacity-50',
        className,
      )}
    >
      <Typography variant="capsNav">{children}</Typography>
    </button>
  )
}

/** Второстепенное действие: текст капсом со стрелкой, подчёркивание только на наведении. */
export function TextLinkAction({
  children,
  arrow = '→',
  className,
  ...props
}: { arrow?: string } & ComponentProps<'button'>) {
  return (
    <button
      {...props}
      className={cn('inline-flex items-center gap-2 hover:underline', className)}
    >
      <Typography variant="capsNav" tone="muted">
        {children}
      </Typography>
      <Typography variant="capsNav" tone="muted" aria-hidden>
        {arrow}
      </Typography>
    </button>
  )
}

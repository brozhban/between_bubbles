import { cn } from '@/lib/utils'

/**
 * Общий вид контролов внутри `UnderlineField` (DESIGN.md → Underline Input):
 * только нижняя граница, фокус утолщает её до 2px.
 */
export const underlineControlClassName = cn(
  'w-full border-0 border-b border-border bg-transparent pb-2 outline-none',
  'focus:border-b-2 focus:border-foreground',
  'disabled:opacity-50',
)

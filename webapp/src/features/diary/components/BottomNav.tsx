import { Link } from '@tanstack/react-router'

import { Typography } from '@/components/ui/typography'
import { useTranslation } from '@/features/auth'
import type { MessageKey } from '@/platform/i18n'
import { cn } from '@/lib/utils'

/**
 * Нижняя навигация (DESIGN.md → Bottom Navigation): подписи капсом, активный пункт
 * подчёркнут на 2px в Mustard Olive, тени нет — только разделитель сверху.
 *
 */
const items = [
  { to: '/', key: 'nav.week' },
  { to: '/add', key: 'nav.add' },
  { to: '/wines', key: 'nav.wines' },
  { to: '/profile', key: 'nav.profile' },
] as const satisfies ReadonlyArray<{ to: string; key: MessageKey }>

export function BottomNav({ className }: { className?: string }) {
  const { t } = useTranslation()

  return (
    <nav
      aria-label={t('nav.primary')}
      className={cn(
        'sticky bottom-0 z-10 grid grid-cols-4 border-t border-border bg-card',
        className,
      )}
    >
      {items.map((item) => (
        <Typography key={item.to} asChild variant="capsLabel" tone="muted">
          <Link
            to={item.to}
            className="flex items-center justify-center border-b-2 border-transparent px-2 py-4 text-center data-[status=active]:border-accent-b data-[status=active]:text-foreground"
          >
            {t(item.key)}
          </Link>
        </Typography>
      ))}
    </nav>
  )
}

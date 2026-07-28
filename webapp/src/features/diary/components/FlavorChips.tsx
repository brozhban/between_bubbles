import { Typography } from '@/components/ui/typography'
import { cn } from '@/lib/utils'

export type FlavorChipOption = {
  id: string
  label: string
}

/**
 * Чипы вкуса и аромата (DESIGN.md → Flavor Tag Chips).
 *
 * `tone` чередуется по группам — фруктово-цветочные Dusty Rose, землисто-пряные Mustard Olive:
 * так два акцента остаются осмысленными, а не декоративными.
 */
export function FlavorChips({
  label,
  options,
  selected,
  onToggle,
  tone = 'a',
  className,
}: {
  label?: string
  options: readonly FlavorChipOption[]
  selected: readonly string[]
  onToggle: (id: string) => void
  tone?: 'a' | 'b'
  className?: string
}) {
  return (
    <div className={cn('grid gap-3', className)}>
      {label && (
        <Typography variant="capsLabel" tone="muted">
          {label}
        </Typography>
      )}

      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const isSelected = selected.includes(option.id)

          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onToggle(option.id)}
              className={cn(
                'border border-border px-3 py-2 transition-colors',
                isSelected
                  ? tone === 'a'
                    ? 'bg-accent-a'
                    : 'bg-accent-b'
                  : 'bg-transparent hover:border-foreground',
              )}
            >
              <Typography
                variant="capsLabel"
                className={isSelected ? 'text-accent-ink' : undefined}
              >
                {option.label}
              </Typography>
            </button>
          )
        })}
      </div>
    </div>
  )
}

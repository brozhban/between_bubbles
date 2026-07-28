import { useId } from 'react'

import { Typography } from '@/components/ui/typography'
import { cn } from '@/lib/utils'

/**
 * Тело / кислотность / танины (DESIGN.md → Scale Slider).
 *
 * Без чисел: значение читается по позиции квадратного ползунка между двумя полюсами.
 * Значения приходят как список кодов перечисления, поэтому один компонент обслуживает
 * и трёхпозиционные шкалы, и шестипозиционные танины.
 */
export function ScaleSlider<TValue extends string>({
  label,
  options,
  poles,
  value,
  onChange,
  className,
}: {
  label: string
  options: readonly TValue[]
  poles: readonly [string, string]
  value: TValue | null
  onChange: (value: TValue) => void
  className?: string
}) {
  const inputId = useId()
  const selectedIndex = value === null ? -1 : options.indexOf(value)

  return (
    <div className={cn('grid gap-2', className)}>
      <Typography asChild variant="capsLabel" tone="muted">
        <label htmlFor={inputId}>{label}</label>
      </Typography>

      <input
        id={inputId}
        type="range"
        min={0}
        max={options.length - 1}
        step={1}
        value={selectedIndex < 0 ? 0 : selectedIndex}
        aria-label={label}
        aria-valuetext={value ?? undefined}
        onChange={(event) => onChange(options[Number(event.target.value)]!)}
        className={cn(
          'h-6 w-full cursor-pointer appearance-none bg-transparent',
          '[&::-webkit-slider-runnable-track]:h-px [&::-webkit-slider-runnable-track]:bg-border',
          '[&::-moz-range-track]:h-px [&::-moz-range-track]:bg-border',
          '[&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none',
          '[&::-webkit-slider-thumb]:-translate-y-1/2 [&::-webkit-slider-thumb]:rounded-none',
          selectedIndex < 0
            ? '[&::-webkit-slider-thumb]:bg-border [&::-moz-range-thumb]:bg-border'
            : '[&::-webkit-slider-thumb]:bg-foreground [&::-moz-range-thumb]:bg-foreground',
          '[&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-none',
          '[&::-moz-range-thumb]:border-0',
        )}
      />

      <div className="flex items-center justify-between">
        <Typography variant="capsPole" tone="muted">
          {poles[0]}
        </Typography>
        <Typography variant="capsPole" tone="muted">
          {poles[1]}
        </Typography>
      </div>
    </div>
  )
}

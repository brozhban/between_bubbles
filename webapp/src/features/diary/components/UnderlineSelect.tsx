import { useId, type ComponentProps } from 'react'

import { Typography } from '@/components/ui/typography'
import { underlineControlClassName } from '../field-styles'
import { UnderlineField } from './UnderlineField'

export type SelectOption = {
  value: string
  label: string
}

/**
 * Нативный `<select>` в оформлении underline-поля.
 *
 * Именно нативный, а не кастомный дропдаун: на мобильном он открывает системный
 * барабан выбора, который для длинных списков вроде справочника стран удобнее любого
 * собственного меню и не требует ни виртуализации, ни ловли фокуса.
 */
export function UnderlineSelect({
  label,
  options,
  placeholder,
  hint,
  error,
  className,
  ...props
}: {
  label: string
  options: readonly SelectOption[]
  placeholder?: string
  hint?: string
  error?: string
} & ComponentProps<'select'>) {
  const generatedId = useId()
  const selectId = props.id ?? generatedId

  return (
    <UnderlineField label={label} htmlFor={selectId} hint={hint} error={error} className={className}>
      <Typography asChild variant="fieldValue">
        <select {...props} id={selectId} className={underlineControlClassName}>
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Typography>
    </UnderlineField>
  )
}

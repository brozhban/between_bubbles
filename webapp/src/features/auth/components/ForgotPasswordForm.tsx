import { passwordForgotSchema } from '@between-bubbles/contracts'
import { useId, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Typography } from '@/components/ui/typography'
import { ApiRequestError } from '@/platform/api'
import { useAuth } from '../use-auth'
import { useTranslation } from '../use-translation'
import { FormAlert } from './form-errors'

/**
 * Запрос ссылки на восстановление пароля (ТЗ §13).
 *
 * Ответ одинаков для знакомого и незнакомого адреса — иначе форма превращается в проверку
 * «зарегистрирован ли этот человек». Поэтому и текст после отправки написан осторожно:
 * «если такой адрес есть», а не «письмо отправлено».
 */
export function ForgotPasswordForm({ onBack }: { onBack: () => void }) {
  const auth = useAuth()
  const { t } = useTranslation()
  const emailId = useId()
  const emailErrorId = useId()
  const [email, setEmail] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [isSent, setIsSent] = useState(false)

  const submit = async () => {
    const result = passwordForgotSchema.safeParse({ email })
    if (!result.success) {
      setFieldError(result.error.issues[0]?.message ?? t('auth.forgotEmailInvalid'))
      return
    }

    setFieldError(null)
    setFormError(null)
    setIsSending(true)
    try {
      await auth.requestPasswordReset(result.data)
      setIsSent(true)
    } catch (caught) {
      setFormError(caught instanceof ApiRequestError ? caught.message : t('auth.unexpected'))
    } finally {
      setIsSending(false)
    }
  }

  if (isSent) {
    return (
      <div className="grid gap-4">
        <Typography>{t('auth.forgotSent')}</Typography>
        <Button type="button" variant="outline" onClick={onBack}>
          {t('auth.backToLogin')}
        </Button>
      </div>
    )
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <FieldGroup className="gap-4">
        <Typography variant="bodySm" tone="muted">
          {t('auth.forgotDescription')}
        </Typography>

        <Field data-invalid={fieldError !== null}>
          <FieldLabel htmlFor={emailId}>{t('auth.email')}</FieldLabel>
          <Input
            id={emailId}
            name="email"
            value={email}
            type="text"
            inputMode="email"
            autoComplete="email"
            aria-invalid={fieldError !== null}
            aria-describedby={fieldError === null ? undefined : emailErrorId}
            onChange={(event) => {
              setEmail(event.target.value)
              setFieldError(null)
              setFormError(null)
            }}
          />
          <FieldError id={emailErrorId} errors={fieldError === null ? undefined : [{ message: fieldError }]} />
        </Field>

        <FormAlert message={formError} />

        <Button type="submit" size="lg" className="w-full" disabled={isSending}>
          {isSending ? t('auth.forgotSending') : t('auth.forgotSubmit')}
        </Button>
        <Button type="button" variant="ghost" onClick={onBack}>
          {t('auth.backToLogin')}
        </Button>
      </FieldGroup>
    </form>
  )
}

import { useForm } from '@tanstack/react-form'
import {
  AGE_DISCLAIMER_EN,
  AGE_DISCLAIMER_RU,
  CURRENT_TERMS_VERSION,
  registerRequestSchema,
  type RegisterRequest,
} from '@between-bubbles/contracts'
import { useId, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Typography } from '@/components/ui/typography'
import { ApiRequestError } from '@/platform/api'
import { useAuth } from '../use-auth'
import { useTranslation } from '../use-translation'
import { ConsentLabel } from './consent-label'
import { FormAlert } from './form-errors'
import type { AuthDraft, FieldErrors } from './form-model'
import { clearFieldError, errorId, hasErrors, toFieldErrors } from './form-validation'

export function RegisterForm({
  draft,
  onDraftChange,
}: {
  draft: AuthDraft
  onDraftChange: (draft: Partial<AuthDraft>) => void
}) {
  const auth = useAuth()
  const { t, locale } = useTranslation()
  const displayNameId = useId()
  const displayNameErrorId = useId()
  const emailId = useId()
  const emailErrorId = useId()
  const passwordId = useId()
  const passwordErrorId = useId()
  const birthDateId = useId()
  const birthDateErrorId = useId()
  const termsErrorId = useId()
  const consentLabelId = useId()
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)

  const form = useForm({
    defaultValues: draft,
    onSubmit: async ({ value }) => {
      setFormError(null)
      if (!value.acceptedTerms) {
        // Проверяем галочку до схемы: иначе пользователь увидит сырое сообщение Zod
        // об отсутствующей версии оферты вместо понятного объяснения.
        setFieldErrors({
          acceptedTermsVersion: [
            { message: t('auth.consentRequired') },
          ],
        })
        return
      }

      const result = registerRequestSchema.safeParse({
        ...value,
        // Таймзона определяется из браузера и задаёт границы недель (ТЗ §6).
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        acceptedTermsVersion: CURRENT_TERMS_VERSION,
      })
      if (!result.success) {
        setFieldErrors(toFieldErrors(result.error.issues))
        return
      }

      setFieldErrors({})
      try {
        await auth.register(result.data as RegisterRequest)
      } catch (caughtError) {
        setFormError(
          caughtError instanceof ApiRequestError ? caughtError.message : t('auth.unexpected'),
        )
      }
    },
  })

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <FieldGroup className="gap-4">
        <form.Field
          name="displayName"
          children={(field) => (
            <Field data-invalid={hasErrors(fieldErrors.displayName)}>
              <FieldLabel htmlFor={displayNameId}>{t('auth.name')}</FieldLabel>
              <Input
                id={displayNameId}
                name={field.name}
                value={field.state.value ?? ''}
                autoComplete="name"
                aria-invalid={hasErrors(fieldErrors.displayName)}
                aria-describedby={errorId(fieldErrors.displayName, displayNameErrorId)}
                onBlur={field.handleBlur}
                onChange={(event) => {
                  const value = event.target.value
                  field.handleChange(value)
                  onDraftChange({ displayName: value })
                  clearFieldError('displayName', setFieldErrors)
                  setFormError(null)
                }}
              />
              <FieldError id={displayNameErrorId} errors={fieldErrors.displayName} />
            </Field>
          )}
        />

        <form.Field
          name="email"
          children={(field) => (
            <Field data-invalid={hasErrors(fieldErrors.email)}>
              <FieldLabel htmlFor={emailId}>{t('auth.email')}</FieldLabel>
              <Input
                id={emailId}
                name={field.name}
                value={field.state.value}
                type="text"
                inputMode="email"
                autoComplete="email"
                aria-invalid={hasErrors(fieldErrors.email)}
                aria-describedby={errorId(fieldErrors.email, emailErrorId)}
                onBlur={field.handleBlur}
                onChange={(event) => {
                  const value = event.target.value
                  field.handleChange(value)
                  onDraftChange({ email: value })
                  clearFieldError('email', setFieldErrors)
                  setFormError(null)
                }}
              />
              <FieldError id={emailErrorId} errors={fieldErrors.email} />
            </Field>
          )}
        />

        <form.Field
          name="password"
          children={(field) => (
            <Field data-invalid={hasErrors(fieldErrors.password)}>
              <FieldLabel htmlFor={passwordId}>{t('auth.password')}</FieldLabel>
              <Input
                id={passwordId}
                name={field.name}
                value={field.state.value}
                type="password"
                autoComplete="new-password"
                aria-invalid={hasErrors(fieldErrors.password)}
                aria-describedby={errorId(fieldErrors.password, passwordErrorId)}
                onBlur={field.handleBlur}
                onChange={(event) => {
                  const value = event.target.value
                  field.handleChange(value)
                  onDraftChange({ password: value })
                  clearFieldError('password', setFieldErrors)
                  setFormError(null)
                }}
              />
              <FieldError id={passwordErrorId} errors={fieldErrors.password} />
            </Field>
          )}
        />

        <form.Field
          name="birthDate"
          children={(field) => (
            <Field data-invalid={hasErrors(fieldErrors.birthDate)}>
              <FieldLabel htmlFor={birthDateId}>{t('auth.birthDate')}</FieldLabel>
              <Input
                id={birthDateId}
                name={field.name}
                value={field.state.value}
                type="date"
                autoComplete="bday"
                aria-invalid={hasErrors(fieldErrors.birthDate)}
                aria-describedby={errorId(fieldErrors.birthDate, birthDateErrorId)}
                onBlur={field.handleBlur}
                onChange={(event) => {
                  const value = event.target.value
                  field.handleChange(value)
                  onDraftChange({ birthDate: value })
                  clearFieldError('birthDate', setFieldErrors)
                  setFormError(null)
                }}
              />
              <FieldError id={birthDateErrorId} errors={fieldErrors.birthDate} />
            </Field>
          )}
        />

        <form.Field
          name="acceptedTerms"
          children={(field) => (
            <Field data-invalid={hasErrors(fieldErrors.acceptedTermsVersion)}>
              <div className="flex items-start gap-3">
                <Checkbox
                  checked={field.state.value}
                  // Единственный контроль, чья задача — зафиксировать осознанное согласие,
                  // а скринридер объявлял его без имени: «checkbox, not checked». Имя берём
                  // из самой подписи, а не дублируем текст в aria-label — иначе они разъедутся.
                  aria-labelledby={consentLabelId}
                  aria-invalid={hasErrors(fieldErrors.acceptedTermsVersion)}
                  aria-describedby={errorId(
                    fieldErrors.acceptedTermsVersion,
                    termsErrorId,
                  )}
                  onCheckedChange={(checked) => {
                    const value = checked === true
                    field.handleChange(value)
                    onDraftChange({ acceptedTerms: value })
                    clearFieldError('acceptedTermsVersion', setFieldErrors)
                    setFormError(null)
                  }}
                />
                <ConsentLabel id={consentLabelId} />
              </div>
              <FieldError id={termsErrorId} errors={fieldErrors.acceptedTermsVersion} />
            </Field>
          )}
        />

        <Typography variant="caption" tone="muted">
          {locale === 'en' ? AGE_DISCLAIMER_EN : AGE_DISCLAIMER_RU}
        </Typography>

        <FormAlert message={formError} />

        <form.Subscribe
          selector={(state) => state.isSubmitting}
          children={(isSubmitting) => (
            <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? t('auth.creating') : t('auth.createAccount')}
            </Button>
          )}
        />
      </FieldGroup>
    </form>
  )
}

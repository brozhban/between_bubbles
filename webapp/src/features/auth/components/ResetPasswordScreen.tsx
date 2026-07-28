import { passwordSchema } from '@between-bubbles/contracts'
import { useId, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Typography } from '@/components/ui/typography'
import { ApiRequestError } from '@/platform/api'
import { useAuth } from '../use-auth'
import { useTranslation } from '../use-translation'
import { FormAlert } from './form-errors'

/**
 * Экран по ссылке из письма (ТЗ §13). Токен приходит в адресе страницы, а не вводится руками.
 *
 * Ссылка одноразовая и живёт час, поэтому просроченную нужно отличать от прочих ошибок:
 * на 410 человеку предлагается запросить письмо заново, а не «попробовать ещё раз».
 */
export function ResetPasswordScreen({ token, onDone }: { token: string; onDone: () => void }) {
  const auth = useAuth()
  const { t } = useTranslation()
  const passwordId = useId()
  const passwordErrorId = useId()
  const [password, setPassword] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [isExpired, setIsExpired] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDone, setIsDone] = useState(false)

  const submit = async () => {
    const result = passwordSchema.safeParse(password)
    if (!result.success) {
      setFieldError(result.error.issues[0]?.message ?? t('auth.resetPasswordInvalid'))
      return
    }

    setFieldError(null)
    setFormError(null)
    setIsSaving(true)
    try {
      await auth.resetPassword({ token, password: result.data })
      setIsDone(true)
    } catch (caught) {
      if (caught instanceof ApiRequestError && caught.status === 410) {
        setIsExpired(true)
      } else {
        setFormError(caught instanceof ApiRequestError ? caught.message : t('auth.unexpected'))
      }
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{t('auth.resetTitle')}</CardTitle>
        <CardDescription>{t('auth.resetDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        {token === '' || isExpired ? (
          <div className="grid gap-4">
            <Typography role="alert">{t('auth.resetExpired')}</Typography>
            <Button type="button" onClick={onDone}>
              {t('auth.backToLogin')}
            </Button>
          </div>
        ) : isDone ? (
          <div className="grid gap-4">
            <Typography>{t('auth.resetDone')}</Typography>
            <Button type="button" onClick={onDone}>
              {t('auth.signIn')}
            </Button>
          </div>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void submit()
            }}
          >
            <FieldGroup className="gap-4">
              <Field data-invalid={fieldError !== null}>
                <FieldLabel htmlFor={passwordId}>{t('auth.newPassword')}</FieldLabel>
                <Input
                  id={passwordId}
                  name="password"
                  value={password}
                  type="password"
                  autoComplete="new-password"
                  aria-invalid={fieldError !== null}
                  aria-describedby={fieldError === null ? undefined : passwordErrorId}
                  onChange={(event) => {
                    setPassword(event.target.value)
                    setFieldError(null)
                    setFormError(null)
                  }}
                />
                <FieldError
                  id={passwordErrorId}
                  errors={fieldError === null ? undefined : [{ message: fieldError }]}
                />
              </Field>

              <FormAlert message={formError} />

              <Button type="submit" size="lg" className="w-full" disabled={isSaving}>
                {isSaving ? t('auth.resetSaving') : t('auth.resetSubmit')}
              </Button>
            </FieldGroup>
          </form>
        )}
      </CardContent>
    </Card>
  )
}

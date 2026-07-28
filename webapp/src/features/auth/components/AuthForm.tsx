import { useState } from 'react'

import { useTranslation } from '../use-translation'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ForgotPasswordForm } from './ForgotPasswordForm'
import { LoginForm } from './LoginForm'
import { emptyDraft, type AuthDraft, type AuthMode } from './form-model'
import { RegisterForm } from './RegisterForm'

export function AuthForm() {
  const { t } = useTranslation()
  const [mode, setMode] = useState<AuthMode>('register')
  const [draft, setDraft] = useState<AuthDraft>(emptyDraft)
  // Восстановление пароля живёт здесь же, а не отдельной страницей: человек уже на форме
  // входа, и уводить его с неё ради одного поля незачем.
  const [isRecovering, setIsRecovering] = useState(false)

  function updateDraft(nextDraft: Partial<AuthDraft>) {
    setDraft((currentDraft) => ({ ...currentDraft, ...nextDraft }))
  }

  return (
    <Card className="w-full" aria-label={t('auth.title')}>
      <CardHeader>
        <CardTitle>{t('auth.title')}</CardTitle>
        <CardDescription>{t('auth.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        {isRecovering ? (
          <ForgotPasswordForm onBack={() => setIsRecovering(false)} />
        ) : (
          <Tabs
            value={mode}
            onValueChange={(nextMode) => {
              if (nextMode === 'login' || nextMode === 'register') setMode(nextMode)
            }}
            className="mb-6"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="register">{t('auth.register')}</TabsTrigger>
              <TabsTrigger value="login">{t('auth.login')}</TabsTrigger>
            </TabsList>
            <TabsContent value="register" forceMount hidden={mode !== 'register'} className="mt-6">
              {mode === 'register' && <RegisterForm draft={draft} onDraftChange={updateDraft} />}
            </TabsContent>
            <TabsContent value="login" forceMount hidden={mode !== 'login'} className="mt-6">
              {mode === 'login' && (
                <LoginForm
                  draft={draft}
                  onDraftChange={updateDraft}
                  onForgotPassword={() => setIsRecovering(true)}
                />
              )}
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  )
}

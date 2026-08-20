import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { resendVerification, verifyEmail } from '@/api/auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/features/auth/AuthContext'
import { apiErrorMessage } from '@/lib/errors'

type Status =
  | { kind: 'idle' }
  | { kind: 'verifying' }
  | { kind: 'success' }
  | { kind: 'error'; message: string }

/** Подтверждение email по токену из письма (?token=...). Публичный роут /verify-email. */
export function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const email = searchParams.get('email')

  const { isAuthenticated, isLoading: isAuthLoading, refreshUser } = useAuth()
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [resendError, setResendError] = useState<string | null>(null)
  // Guard от двойного вызова useEffect в StrictMode (dev) — токен одноразовый.
  const startedRef = useRef(false)
  const refreshedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    if (token == null || token === '') {
      setStatus({ kind: 'error', message: 'Неверная ссылка подтверждения' })
      return
    }

    setStatus({ kind: 'verifying' })
    void verifyEmail(token)
      .then(() => {
        setStatus({ kind: 'success' })
      })
      .catch((err: unknown) => {
        setStatus({ kind: 'error', message: apiErrorMessage(err) })
      })
  }, [token])

  // Профиль (email_verified в /users/me) обновляем отдельным эффектом: на момент
  // подтверждения AuthProvider ещё восстанавливает сессию, и isAuthenticated у
  // залогиненного пользователя там всё ещё false — прежняя проверка внутри
  // .then() не срабатывала никогда.
  useEffect(() => {
    if (status.kind !== 'success' || isAuthLoading || !isAuthenticated) return
    if (refreshedRef.current) return
    refreshedRef.current = true
    void refreshUser()
  }, [status.kind, isAuthLoading, isAuthenticated, refreshUser])

  async function handleResend(): Promise<void> {
    if (email == null || email === '') return
    setResendState('sending')
    setResendError(null)
    try {
      await resendVerification(email)
      setResendState('sent')
    } catch (err) {
      setResendError(apiErrorMessage(err))
      setResendState('idle')
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Подтверждение email</CardTitle>
          <CardDescription>
            {status.kind === 'error'
              ? 'Не удалось подтвердить адрес электронной почты'
              : 'Проверяем вашу ссылку…'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(status.kind === 'idle' || status.kind === 'verifying') && (
            <div className="flex flex-col items-center gap-3 py-4">
              <div
                className="border-primary size-8 animate-spin rounded-full border-2 border-t-transparent"
                role="status"
                aria-label="Загрузка"
              />
              <p className="text-muted-foreground text-sm">Подтверждаем email…</p>
            </div>
          )}

          {status.kind === 'success' && (
            <div className="space-y-4">
              <p className="text-sm">Email подтверждён! Теперь вы можете войти.</p>
              <Button asChild className="w-full">
                <Link to="/login">Войти</Link>
              </Button>
            </div>
          )}

          {status.kind === 'error' && (
            <div className="space-y-4">
              <p className="text-destructive text-sm">{status.message}</p>
              <div className="flex gap-2">
                <Button asChild className="flex-1">
                  <Link to="/login">Войти</Link>
                </Button>
                {email != null && email !== '' && (
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={handleResend}
                    disabled={resendState === 'sending'}
                  >
                    {resendState === 'sending' ? 'Отправляем…' : 'Отправить письмо ещё раз'}
                  </Button>
                )}
              </div>
              {resendState === 'sent' && (
                <p className="text-muted-foreground text-sm">Письмо отправлено ещё раз.</p>
              )}
              {resendError != null && <p className="text-destructive text-sm">{resendError}</p>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
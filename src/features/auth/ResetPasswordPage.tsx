import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { resetPassword } from '@/api/auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { apiErrorMessage } from '@/lib/errors'

/**
 * Сброс пароля, шаг 2 — установка нового пароля по токену из письма (?token=...).
 * Публичный роут /reset-password (вне GuestRoute): ссылкой могут воспользоваться
 * как залогиненные, так и гостевые пользователи.
 */
export function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)

  // Все хуки объявлены выше: ранний return только после них.
  if (token == null || token === '') {
    return (
      <div className="mx-auto max-w-md">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Сброс пароля</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-destructive text-sm">Неверная ссылка сброса пароля.</p>
            <p className="mt-4 text-sm">
              <Link to="/login" className="text-muted-foreground underline-offset-4 hover:underline">
                ← На логин
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const resetToken = token

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    setError(null)
    setFieldError(null)

    if (password.length < 8) {
      setFieldError('Пароль должен содержать не менее 8 символов.')
      return
    }
    if (password !== confirm) {
      setFieldError('Пароли не совпадают.')
      return
    }

    setSubmitting(true)
    try {
      await resetPassword(resetToken, password)
      setDone(true)
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Сброс пароля</CardTitle>
          <CardDescription>Задайте новый пароль для вашего аккаунта.</CardDescription>
        </CardHeader>
        <CardContent>
          {done ? (
            <div className="space-y-4">
              <p className="text-sm">Пароль изменён!</p>
              <Button asChild className="w-full">
                <Link to="/login">Войти</Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="reset-password" className="text-sm font-medium">
                  Новый пароль
                </label>
                <Input
                  id="reset-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Минимум 8 символов"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="reset-confirm" className="text-sm font-medium">
                  Повторите пароль
                </label>
                <Input
                  id="reset-confirm"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  placeholder="Ещё раз"
                />
              </div>

              {fieldError != null && <p className="text-destructive text-sm">{fieldError}</p>}
              {error != null && <p className="text-destructive text-sm">{error}</p>}

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Сохраняем…' : 'Сохранить новый пароль'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
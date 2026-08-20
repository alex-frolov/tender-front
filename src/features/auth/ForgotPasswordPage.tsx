import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { forgotPassword, type ForgotPasswordError } from '@/api/auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { apiErrorMessage, isApiError } from '@/lib/errors'

/** Сообщение при 429 (rate_limited): с Retry-After, если заголовок пришёл. */
function rateLimitMessage(error: ForgotPasswordError): string {
  if (error.retryAfter != null) {
    return `Слишком много запросов. Попробуйте ещё раз через ${error.retryAfter} сек.`
  }
  return 'Слишком много запросов. Попробуйте ещё раз через несколько минут.'
}

/**
 * Восстановление пароля, шаг 1 — запрос ссылки на email.
 * Публичный роут /forgot-password. Успех показывается одинаково для любого
 * исхода (API не раскрывает существование аккаунта).
 */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await forgotPassword(email)
      setSent(true)
    } catch (err) {
      if (isApiError(err) && err.code === 'rate_limited') {
        setError(rateLimitMessage(err as ForgotPasswordError))
      } else {
        setError(apiErrorMessage(err))
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Восстановление пароля</CardTitle>
          <CardDescription>
            Укажите email, на который зарегистрирован аккаунт — мы пришлём ссылку для сброса пароля.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="space-y-4">
              <p className="text-sm">
                Если аккаунт с таким email существует, мы отправили ссылку для сброса пароля.
                Проверьте входящие (и папку «Спам»).
              </p>
              <Button asChild className="w-full">
                <Link to="/login">На логин</Link>
              </Button>
            </div>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="forgot-email" className="text-sm font-medium">
                    Email
                  </label>
                  <Input
                    id="forgot-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@company.ru"
                  />
                </div>

                {error != null && <p className="text-destructive text-sm">{error}</p>}

                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? 'Отправляем…' : 'Отправить ссылку'}
                </Button>
              </form>

              <p className="mt-4 text-sm">
                <Link to="/login" className="text-muted-foreground underline-offset-4 hover:underline">
                  ← На логин
                </Link>
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/features/auth/AuthContext'
import { apiErrorMessage, isTotpRequired } from '@/lib/errors'

/**
 * Ключ sessionStorage для уведомления на странице логина. Используется после
 * смены пароля в профиле (сессия принудительно завершается, refresh отозван) —
 * переживает редирект через ProtectedRoute.
 */
export const LOGIN_NOTICE_KEY = 'tp.login.notice'

/**
 * Куда возвращать после логина. `?from=` приходит из адресной строки, поэтому
 * пускаем только внутренний путь: `//evil.com` и `https://evil.com` react-router
 * отдаёт в location.assign — это был бы открытый редирект сразу после входа.
 */
function safeRedirect(value: string | null | undefined): string | null {
  // Второй слэш (или обратный — браузеры считают его тем же) делает путь
  // protocol-relative, то есть внешним.
  if (value == null || value[0] !== '/' || value[1] === '/' || value[1] === '\\') return null
  return value
}

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [needTotp, setNeedTotp] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Показываем одноразовое уведомление (например, после смены пароля).
  useEffect(() => {
    const stored = sessionStorage.getItem(LOGIN_NOTICE_KEY)
    if (stored != null) {
      sessionStorage.removeItem(LOGIN_NOTICE_KEY)
      setNotice(stored)
    }
  }, [])

  // Откуда пришли: state.from (защищённый роут) или query ?from= (сессия истекла).
  const fromQuery = new URLSearchParams(location.search).get('from')
  const from =
    safeRedirect((location.state as { from?: string } | null)?.from) ??
    safeRedirect(fromQuery) ??
    '/tenders'

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setError(null)
    setNotice(null)
    setSubmitting(true)
    try {
      await login({ email, password, totpCode: needTotp ? totpCode : undefined })
      navigate(from, { replace: true })
    } catch (err) {
      if (isTotpRequired(err)) {
        setNeedTotp(true)
        setError('Для входа нужен код из приложения-аутентификатора (2FA).')
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
          <CardTitle className="text-xl">Вход</CardTitle>
          <CardDescription>Войдите в свою учётную запись, чтобы работать с тендерами.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="login-email" className="text-sm font-medium">
                Email
              </label>
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.ru"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="login-password" className="text-sm font-medium">
                Пароль
              </label>
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
              />
            </div>

            {needTotp && (
              <div className="space-y-1.5">
                <label htmlFor="login-totp" className="text-sm font-medium">
                  TOTP-код (6 цифр)
                </label>
                <Input
                  id="login-totp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="\d{6}"
                  maxLength={6}
                  required
                  value={totpCode}
                  onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                />
              </div>
            )}

            {error != null && <p className="text-destructive text-sm">{error}</p>}
            {notice != null && <p className="text-muted-foreground text-sm">{notice}</p>}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Входим…' : 'Войти'}
            </Button>
          </form>

          <div className="mt-4 flex items-center justify-between text-sm">
            <Link to="/forgot-password" className="text-muted-foreground underline-offset-4 hover:underline">
              Забыли пароль?
            </Link>
            <Link to="/register" className="text-primary underline-offset-4 hover:underline">
              Зарегистрироваться
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
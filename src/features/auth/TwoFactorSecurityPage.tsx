import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/features/auth/AuthContext'
import { apiErrorMessage } from '@/lib/errors'
import { confirm2fa, disable2fa, setup2fa } from '@/api/auth'

interface SetupSecret {
  secret?: string
  otpauth_uri?: string
}

/**
 * Настройка двухфакторной аутентификации.
 * Рабочая цепочка: setup (получение секрета) → confirm (ввод 6 цифр) → включено.
 * QR-код в этой сборке — текстовая заглушка: секрет выводится как есть.
 */
export function TwoFactorSecurityPage() {
  const { user, refreshUser } = useAuth()
  const [setupSecret, setSetupSecret] = useState<SetupSecret | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const enabled = user?.two_factor_enabled ?? false

  async function handleSetup(): Promise<void> {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const secret = await setup2fa()
      setSetupSecret(secret)
      setCode('')
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleConfirm(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (setupSecret?.secret == null) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await confirm2fa(setupSecret.secret, code)
      setSetupSecret(null)
      setCode('')
      await refreshUser()
      setMessage('Двухфакторная аутентификация включена.')
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleDisable(event: FormEvent): Promise<void> {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await disable2fa(code)
      setCode('')
      await refreshUser()
      setMessage('Двухфакторная аутентификация отключена.')
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="text-xl">Двухфакторная аутентификация</CardTitle>
            <Badge variant={enabled ? 'default' : 'secondary'}>
              {enabled ? 'Включена' : 'Выключена'}
            </Badge>
          </div>
          <CardDescription>
            Дополнительная защита аккаунта: при входе потребуется 6-значный код из приложения-аутентификатора.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {message != null && <p className="text-sm text-foreground">{message}</p>}
          {error != null && <p className="text-destructive text-sm">{error}</p>}

          {!enabled && setupSecret == null && (
            <Button onClick={handleSetup} disabled={busy}>
              {busy ? 'Запрашиваем секрет…' : 'Включить 2FA'}
            </Button>
          )}

          {!enabled && setupSecret != null && (
            <form onSubmit={handleConfirm} className="space-y-4">
              <div className="space-y-1.5">
                <p className="text-sm">
                  Добавьте секрет в приложение-аутентификатор (Google Authenticator, 1Password и т.п.).
                </p>
                {setupSecret.otpauth_uri != null && (
                  <p className="text-muted-foreground break-all font-mono text-xs">
                    otpauth: {setupSecret.otpauth_uri}
                  </p>
                )}
                {setupSecret.secret != null && (
                  <p className="text-muted-foreground break-all font-mono text-xs">
                    Секрет (Base32): {setupSecret.secret}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="2fa-confirm-code" className="text-sm font-medium">
                  Код из приложения (6 цифр)
                </label>
                <Input
                  id="2fa-confirm-code"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                />
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={busy}>
                  {busy ? 'Проверяем…' : 'Подтвердить и включить'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setSetupSecret(null)}
                >
                  Отмена
                </Button>
              </div>
            </form>
          )}

          {enabled && (
            <form onSubmit={handleDisable} className="space-y-4">
              <p className="text-sm">
                Для отключения введите текущий код из приложения-аутентификатора.
              </p>
              <div className="space-y-1.5">
                <label htmlFor="2fa-disable-code" className="text-sm font-medium">
                  Код из приложения (6 цифр)
                </label>
                <Input
                  id="2fa-disable-code"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                />
              </div>
              <Button type="submit" variant="destructive" disabled={busy}>
                {busy ? 'Отключаем…' : 'Отключить 2FA'}
              </Button>
            </form>
          )}

          <p className="pt-2 text-sm">
            <Link to="/profile" className="text-muted-foreground underline-offset-4 hover:underline">
              ← Назад к профилю
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { updateMe } from '@/api/auth'
import { useAuth } from '@/features/auth/AuthContext'
import { LOGIN_NOTICE_KEY } from '@/features/auth/LoginPage'
import { apiErrorMessage, isApiError } from '@/lib/errors'
import {
  ROLE_LABELS,
  VERIFICATION_BADGE_VARIANTS,
  VERIFICATION_LABELS,
} from '@/lib/users'

/** Русское сообщение об ошибке смены пароля (в т.ч. неверный текущий пароль). */
function passwordChangeErrorMessage(err: unknown): string {
  if (isApiError(err)) {
    const fieldError = err.errors?.find((item) => item.field === 'current_password')
    if (fieldError != null) {
      return fieldError.message || 'Неверный текущий пароль'
    }
    if (err.code === 'validation_error' || err.code === 'invalid_credentials') {
      return 'Неверный текущий пароль'
    }
  }
  return apiErrorMessage(err)
}

/** Личный профиль: имя, email, роль, статус верификации, 2FA и выход. */
export function ProfilePage() {
  const { user, logout, refreshUser } = useAuth()
  const [name, setName] = useState(user?.name ?? '')
  const [editingName, setEditingName] = useState(false)
  const [savingName, setSavingName] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const [nameMessage, setNameMessage] = useState<string | null>(null)
  const [loggingOut, setLoggingOut] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)

  // ProtectedRoute гарантирует наличие user; ранний return — защита от undefined.
  if (user == null) {
    return null
  }

  const roleLabel = ROLE_LABELS[user.role ?? 'agent']
  const verificationStatus = user.verification_status ?? 'active'
  const verificationLabel = VERIFICATION_LABELS[verificationStatus] ?? verificationStatus

  async function handleNameSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setNameError(null)
    setNameMessage(null)
    setSavingName(true)
    try {
      await updateMe({ name })
      await refreshUser()
      setEditingName(false)
      setNameMessage('Имя обновлено.')
    } catch (err) {
      setNameError(apiErrorMessage(err))
    } finally {
      setSavingName(false)
    }
  }

  async function handlePasswordSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setPasswordError(null)

    if (currentPassword === '') {
      setPasswordError('Укажите текущий пароль.')
      return
    }
    if (newPassword.length < 8) {
      setPasswordError('Новый пароль должен содержать не менее 8 символов.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Новые пароли не совпадают.')
      return
    }

    setSavingPassword(true)
    try {
      await updateMe({ current_password: currentPassword, new_password: newPassword })
      // Бэкенд отозвал refresh-токены: принудительно завершаем сессию и просим
      // войти с новым паролем. Уведомление переживает редирект через sessionStorage.
      sessionStorage.setItem(LOGIN_NOTICE_KEY, 'Пароль изменён. Войдите с новым паролем.')
      await logout()
    } catch (err) {
      setPasswordError(passwordChangeErrorMessage(err))
      setSavingPassword(false)
    }
  }

  async function handleLogout(): Promise<void> {
    setLoggingOut(true)
    await logout()
    // ProtectedRoute отправит на /login автоматически.
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Профиль</CardTitle>
          <CardDescription>Данные вашей учётной записи.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Имя</dt>
              <dd className="font-medium">{user.name || '—'}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Email</dt>
              <dd className="font-medium">{user.email || '—'}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Роль</dt>
              <dd>
                <Badge variant="outline">{roleLabel}</Badge>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Статус верификации</dt>
              <dd>
                <Badge variant={VERIFICATION_BADGE_VARIANTS[verificationStatus]}>
                  {verificationLabel}
                </Badge>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">2FA</dt>
              <dd>
                <Badge variant={user.two_factor_enabled ? 'default' : 'secondary'}>
                  {user.two_factor_enabled ? 'Включена' : 'Выключена'}
                </Badge>
              </dd>
            </div>
          </dl>

          <div className="border-t pt-4">
            {editingName ? (
              <form onSubmit={handleNameSubmit} className="flex items-end gap-2">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <label htmlFor="profile-name" className="text-sm font-medium">
                    Новое имя
                  </label>
                  <Input
                    id="profile-name"
                    required
                    maxLength={200}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </div>
                <Button type="submit" disabled={savingName}>
                  {savingName ? 'Сохраняем…' : 'Сохранить'}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setEditingName(false)}>
                  Отмена
                </Button>
              </form>
            ) : (
              <Button variant="outline" onClick={() => setEditingName(true)}>
                Изменить имя
              </Button>
            )}
            {nameError != null && <p className="text-destructive mt-2 text-sm">{nameError}</p>}
            {nameMessage != null && <p className="mt-2 text-sm">{nameMessage}</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Безопасность</CardTitle>
          <CardDescription>
            Управление двухфакторной аутентификацией и паролем.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link to="/settings/security">Настройки безопасности</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Смена пароля</CardTitle>
          <CardDescription>
            После смены пароля все активные сессии будут завершены — потребуется войти заново.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="profile-current-password" className="text-sm font-medium">
                Текущий пароль
              </label>
              <Input
                id="profile-current-password"
                type="password"
                autoComplete="current-password"
                required
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                placeholder="••••••••"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="profile-new-password" className="text-sm font-medium">
                Новый пароль
              </label>
              <Input
                id="profile-new-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="Минимум 8 символов"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="profile-confirm-password" className="text-sm font-medium">
                Повторите новый пароль
              </label>
              <Input
                id="profile-confirm-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Ещё раз"
              />
            </div>

            {passwordError != null && <p className="text-destructive text-sm">{passwordError}</p>}

            <Button type="submit" disabled={savingPassword}>
              {savingPassword ? 'Сохраняем…' : 'Сменить пароль'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Button variant="destructive" onClick={handleLogout} disabled={loggingOut}>
        {loggingOut ? 'Выходим…' : 'Выйти'}
      </Button>
    </div>
  )
}
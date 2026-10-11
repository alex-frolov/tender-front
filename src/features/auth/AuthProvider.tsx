import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { refreshTokens } from '@/api/client'
import { clearTokens, getRefreshToken, setTokens } from '@/lib/auth-store'
import { onSessionExpired } from '@/lib/authEvents'
import {
  getMe,
  loginRequest,
  logoutRequest,
  registerRequest,
  type LoginInput,
  type RegisterInput,
  type User,
} from '@/api/auth'
import { AuthContext, type AuthContextValue } from './useAuth'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const queryClient = useQueryClient()

  // Сессия умерла (middleware: 401 + неудачный refresh) — чистим всё и на логин.
  const handleSessionExpired = useCallback(() => {
    clearTokens()
    setUser(null)
    queryClient.clear()
    const from = window.location.pathname + window.location.search
    window.location.assign(`/login?from=${encodeURIComponent(from)}`)
  }, [queryClient])

  useEffect(() => onSessionExpired(handleSessionExpired), [handleSessionExpired])

  // Восстановление сессии при монтировании: есть refresh → POST /auth/refresh → GET /users/me.
  // Refresh идёт через общий refreshTokens(): StrictMode запускает этот эффект
  // дважды, и второй самостоятельный refresh тем же токеном получил бы 401
  // (бэкенд отзывает использованный refresh) и стёр бы только что выданную пару.
  useEffect(() => {
    let cancelled = false

    async function bootstrap(): Promise<void> {
      if (getRefreshToken() == null) {
        if (!cancelled) setIsLoading(false)
        return
      }
      try {
        const outcome = await refreshTokens()
        // auth-failed — refresh мёртв, чистим; network-failed — сервер недоступен,
        // токен оставляем: сессия восстановится при следующей загрузке.
        if (outcome === 'auth-failed') clearTokens()
        if (outcome !== 'ok') return
        const me = await getMe()
        if (!cancelled) setUser(me.user ?? null)
      } catch {
        // Профиль не загрузился — без пользователя приложение покажет вход.
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void bootstrap()
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(
    async (input: LoginInput) => {
      const tokens = await loginRequest(input)
      setTokens(tokens)
      const me = await getMe()
      setUser(me.user ?? null)
      queryClient.clear()
    },
    [queryClient],
  )

  const register = useCallback((input: RegisterInput) => registerRequest(input), [])

  const logout = useCallback(async () => {
    const refreshToken = getRefreshToken()
    if (refreshToken != null) {
      try {
        await logoutRequest(refreshToken)
      } catch {
        // Revoke refresh-токена — best effort: локальная сессия очищается в любом случае.
      }
    }
    clearTokens()
    setUser(null)
    queryClient.clear()
  }, [queryClient])

  const refreshUser = useCallback(async () => {
    const me = await getMe()
    const next = me.user ?? null
    setUser(next)
    return next
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user != null,
      isLoading,
      login,
      register,
      logout,
      refreshUser,
    }),
    [user, isLoading, login, register, logout, refreshUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

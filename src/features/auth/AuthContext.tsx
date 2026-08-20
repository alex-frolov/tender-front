import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { clearTokens, getRefreshToken, setTokens } from '@/lib/auth-store'
import { onSessionExpired } from '@/lib/authEvents'
import {
  getMe,
  loginRequest,
  logoutRequest,
  refreshSession,
  registerRequest,
  type LoginInput,
  type RegisterInput,
  type RegisterResult,
  type User,
} from '@/api/auth'

interface AuthContextValue {
  user: User | null
  isAuthenticated: boolean
  /** true, пока при монтировании идёт восстановление сессии (refresh + профиль). */
  isLoading: boolean
  login: (input: LoginInput) => Promise<void>
  register: (input: RegisterInput) => Promise<RegisterResult>
  logout: () => Promise<void>
  refreshUser: () => Promise<User | null>
}

const AuthContext = createContext<AuthContextValue | null>(null)

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
  useEffect(() => {
    let cancelled = false

    async function bootstrap(): Promise<void> {
      const refreshToken = getRefreshToken()
      if (refreshToken == null) {
        if (!cancelled) setIsLoading(false)
        return
      }
      try {
        const tokens = await refreshSession(refreshToken)
        setTokens(tokens)
        const me = await getMe()
        if (!cancelled) setUser(me.user ?? null)
      } catch {
        if (!cancelled) clearTokens()
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

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (ctx == null) {
    throw new Error('useAuth должен использоваться внутри <AuthProvider>')
  }
  return ctx
}
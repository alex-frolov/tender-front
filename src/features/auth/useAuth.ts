import { createContext, useContext } from 'react'
import type { LoginInput, RegisterInput, RegisterResult, User } from '@/api/auth'

export interface AuthContextValue {
  user: User | null
  isAuthenticated: boolean
  /** true, пока при монтировании идёт восстановление сессии (refresh + профиль). */
  isLoading: boolean
  login: (input: LoginInput) => Promise<void>
  register: (input: RegisterInput) => Promise<RegisterResult>
  logout: () => Promise<void>
  refreshUser: () => Promise<User | null>
}

/**
 * Контекст живёт отдельно от провайдера: файл с компонентом должен
 * экспортировать только компоненты, иначе fast refresh перезагружает страницу.
 */
export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (ctx == null) {
    throw new Error('useAuth должен использоваться внутри <AuthProvider>')
  }
  return ctx
}

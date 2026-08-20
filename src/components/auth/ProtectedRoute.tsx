import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'

/** Центрированный спиннер на время проверки/восстановления сессии. */
export function FullPageSpinner() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div
        className="border-primary size-8 animate-spin rounded-full border-2 border-t-transparent"
        role="status"
        aria-label="Загрузка"
      />
    </div>
  )
}

/**
 * Защищённый роут: пока сессия проверяется — спиннер; без аутентификации —
 * редирект на /login с сохранением исходного адреса (state.from).
 */
export function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return <FullPageSpinner />
  }
  if (!isAuthenticated) {
    return (
      <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
    )
  }
  return <Outlet />
}

/**
 * Публичный роут (/login, /register): доступен без сессии; залогиненных уводит
 * на /tenders (или на адрес из state.from — например, после успешного логина).
 */
export function GuestRoute() {
  const { isAuthenticated, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return <FullPageSpinner />
  }
  if (isAuthenticated) {
    const from = (location.state as { from?: string } | null)?.from ?? '/tenders'
    return <Navigate to={from} replace />
  }
  return <Outlet />
}
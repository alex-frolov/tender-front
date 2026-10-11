import type { ComponentType } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { FullPageSpinner, GuestRoute, ProtectedRoute } from '@/components/auth/ProtectedRoute'

/**
 * Маршруты приложения. Этап 1.2:
 * - /login, /register — публичные (GuestRoute; залогиненных уводит на /tenders);
 * - /forgot-password, /reset-password, /verify-email — публичные (вне GuestRoute:
 *   можно прийти по ссылке из письма как залогиненным, так и нет);
 * - /tenders, /tenders/:id, /auctions, /auctions/:id, /contracts, /my-company,
 *   /admin/companies, /notifications, /profile, /settings/*, /users —
 *   под ProtectedRoute (без сессии → /login с state.from).
 *
 * Страницы подключаются лениво (`lazy`): каждая — отдельный чанк, в начальный
 * бандл входят только каркас (AppLayout) и охрана роутов. До этого всё
 * приложение уходило одним файлом ~780 КБ.
 *
 * /settings — раздел с вкладками (SettingsLayout): безопасность и API-ключи
 * доступны всем ролям, webhooks — администраторам, площадка и права ролей —
 * суперадмину. Видимость вкладки не заменяет проверку прав: страницы
 * обрабатывают 403 и при прямом заходе по URL.
 */
/** Ленивая страница: модуль `load()` экспортирует компонент под именем `name`. */
function page<Name extends string>(
  load: () => Promise<Record<Name, ComponentType>>,
  name: Name,
): () => Promise<{ Component: ComponentType }> {
  return async () => ({ Component: (await load())[name] })
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    // Первая загрузка ленивой страницы: пока чанк в пути, показываем спиннер.
    HydrateFallback: FullPageSpinner,
    children: [
      {
        element: <GuestRoute />,
        children: [
          { path: 'login', lazy: page(() => import('@/features/auth/LoginPage'), 'LoginPage') },
          {
            path: 'register',
            lazy: page(() => import('@/features/auth/RegisterPage'), 'RegisterPage'),
          },
        ],
      },
      // Публичные роуты (вне GuestRoute): пользователь может прийти по ссылке из
      // письма как залогиненным, так и нет.
      {
        path: 'verify-email',
        lazy: page(() => import('@/features/auth/VerifyEmailPage'), 'VerifyEmailPage'),
      },
      {
        path: 'forgot-password',
        lazy: page(() => import('@/features/auth/ForgotPasswordPage'), 'ForgotPasswordPage'),
      },
      {
        path: 'reset-password',
        lazy: page(() => import('@/features/auth/ResetPasswordPage'), 'ResetPasswordPage'),
      },
      {
        element: <ProtectedRoute />,
        children: [
          // Корень — обзор компании (раньше редиректил на список тендеров).
          // Внутри ProtectedRoute: дашборд считается по компании актора,
          // гостю показывать нечего.
          {
            index: true,
            lazy: page(() => import('@/features/dashboard/DashboardPage'), 'DashboardPage'),
          },
          {
            path: 'tenders',
            lazy: page(() => import('@/features/tenders/TendersPage'), 'TendersPage'),
          },
          // Статический сегмент раньше динамического: React Router v7 приоритизирует
          // статику, но порядок в дереве всё равно важен для читаемости.
          {
            path: 'tenders/new',
            lazy: page(() => import('@/features/tenders/TenderCreatePage'), 'TenderCreatePage'),
          },
          {
            path: 'tenders/:tenderId',
            lazy: page(() => import('@/features/tenders/TenderDetailPage'), 'TenderDetailPage'),
          },
          {
            path: 'auctions',
            lazy: page(() => import('@/features/auction/AuctionsPage'), 'AuctionsPage'),
          },
          {
            path: 'auctions/:auctionId',
            lazy: page(() => import('@/features/auction/AuctionPage'), 'AuctionPage'),
          },
          {
            path: 'contracts',
            lazy: page(() => import('@/features/contracts/ContractsPage'), 'ContractsPage'),
          },
          {
            path: 'procurement-plans',
            lazy: page(() => import('@/features/planning/ProcurementPlansPage'), 'ProcurementPlansPage'),
          },
          {
            path: 'my-company',
            lazy: page(() => import('@/features/company/MyCompanyPage'), 'MyCompanyPage'),
          },
          // Реестр компаний площадки — только platform_admin (сама страница
          // показывает заглушку остальным ролям, API отдаёт им 403).
          {
            path: 'admin/companies',
            lazy: page(() => import('@/features/company/CompaniesAdminPage'), 'CompaniesAdminPage'),
          },
          {
            path: 'notifications',
            lazy: page(() => import('@/features/notifications/NotificationsPage'), 'NotificationsPage'),
          },
          {
            path: 'profile',
            lazy: page(() => import('@/features/auth/ProfilePage'), 'ProfilePage'),
          },
          {
            path: 'settings',
            lazy: page(() => import('@/features/settings/SettingsLayout'), 'SettingsLayout'),
            children: [
              { index: true, element: <Navigate to="/settings/security" replace /> },
              {
                path: 'security',
                lazy: page(() => import('@/features/auth/TwoFactorSecurityPage'), 'TwoFactorSecurityPage'),
              },
              {
                path: 'api-keys',
                lazy: page(() => import('@/features/settings/ApiKeysPage'), 'ApiKeysPage'),
              },
              {
                path: 'webhooks',
                lazy: page(() => import('@/features/settings/WebhooksPage'), 'WebhooksPage'),
              },
              {
                path: 'platform',
                lazy: page(() => import('@/features/settings/PlatformSettingsPage'), 'PlatformSettingsPage'),
              },
              {
                path: 'role-permissions',
                lazy: page(() => import('@/features/settings/RolePermissionsPage'), 'RolePermissionsPage'),
              },
            ],
          },
          { path: 'users', lazy: page(() => import('@/features/users/UsersPage'), 'UsersPage') },
        ],
      },
      { path: '*', element: <Navigate to="/tenders" replace /> },
    ],
  },
])
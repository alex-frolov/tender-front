import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { GuestRoute, ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { LoginPage } from '@/features/auth/LoginPage'
import { RegisterPage } from '@/features/auth/RegisterPage'
import { VerifyEmailPage } from '@/features/auth/VerifyEmailPage'
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage'
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage'
import { ProfilePage } from '@/features/auth/ProfilePage'
import { TwoFactorSecurityPage } from '@/features/auth/TwoFactorSecurityPage'
import { UsersPage } from '@/features/users/UsersPage'
import { TendersPage } from '@/features/tenders/TendersPage'
import { TenderDetailPage } from '@/features/tenders/TenderDetailPage'
import { TenderCreatePage } from '@/features/tenders/TenderCreatePage'
import { AuctionPage } from '@/features/auction/AuctionPage'
import { AuctionsPage } from '@/features/auction/AuctionsPage'
import { ContractsPage } from '@/features/contracts/ContractsPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { ProcurementPlansPage } from '@/features/planning/ProcurementPlansPage'
import { CompaniesAdminPage } from '@/features/company/CompaniesAdminPage'
import { MyCompanyPage } from '@/features/company/MyCompanyPage'
import { NotificationsPage } from '@/features/notifications/NotificationsPage'
import { SettingsLayout } from '@/features/settings/SettingsLayout'
import { ApiKeysPage } from '@/features/settings/ApiKeysPage'
import { WebhooksPage } from '@/features/settings/WebhooksPage'
import { PlatformSettingsPage } from '@/features/settings/PlatformSettingsPage'
import { RolePermissionsPage } from '@/features/settings/RolePermissionsPage'

/**
 * Маршруты приложения. Этап 1.2:
 * - /login, /register — публичные (GuestRoute; залогиненных уводит на /tenders);
 * - /forgot-password, /reset-password, /verify-email — публичные (вне GuestRoute:
 *   можно прийти по ссылке из письма как залогиненным, так и нет);
 * - /tenders, /tenders/:id, /auctions, /auctions/:id, /contracts, /my-company,
 *   /admin/companies, /notifications, /profile, /settings/*, /users —
 *   под ProtectedRoute (без сессии → /login с state.from).
 *
 * /settings — раздел с вкладками (SettingsLayout): безопасность и API-ключи
 * доступны всем ролям, webhooks — администраторам, площадка и права ролей —
 * суперадмину. Видимость вкладки не заменяет проверку прав: страницы
 * обрабатывают 403 и при прямом заходе по URL.
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      {
        element: <GuestRoute />,
        children: [
          { path: 'login', element: <LoginPage /> },
          { path: 'register', element: <RegisterPage /> },
        ],
      },
      // Публичные роуты (вне GuestRoute): пользователь может прийти по ссылке из
      // письма как залогиненным, так и нет.
      { path: 'verify-email', element: <VerifyEmailPage /> },
      { path: 'forgot-password', element: <ForgotPasswordPage /> },
      { path: 'reset-password', element: <ResetPasswordPage /> },
      {
        element: <ProtectedRoute />,
        children: [
          // Корень — обзор компании (раньше редиректил на список тендеров).
          // Внутри ProtectedRoute: дашборд считается по компании актора,
          // гостю показывать нечего.
          { index: true, element: <DashboardPage /> },
          { path: 'tenders', element: <TendersPage /> },
          // Статический сегмент раньше динамического: React Router v7 приоритизирует
          // статику, но порядок в дереве всё равно важен для читаемости.
          { path: 'tenders/new', element: <TenderCreatePage /> },
          { path: 'tenders/:tenderId', element: <TenderDetailPage /> },
          { path: 'auctions', element: <AuctionsPage /> },
          { path: 'auctions/:auctionId', element: <AuctionPage /> },
          { path: 'contracts', element: <ContractsPage /> },
          { path: 'procurement-plans', element: <ProcurementPlansPage /> },
          { path: 'my-company', element: <MyCompanyPage /> },
          // Реестр компаний площадки — только platform_admin (сама страница
          // показывает заглушку остальным ролям, API отдаёт им 403).
          { path: 'admin/companies', element: <CompaniesAdminPage /> },
          { path: 'notifications', element: <NotificationsPage /> },
          { path: 'profile', element: <ProfilePage /> },
          {
            path: 'settings',
            element: <SettingsLayout />,
            children: [
              { index: true, element: <Navigate to="/settings/security" replace /> },
              { path: 'security', element: <TwoFactorSecurityPage /> },
              { path: 'api-keys', element: <ApiKeysPage /> },
              { path: 'webhooks', element: <WebhooksPage /> },
              { path: 'platform', element: <PlatformSettingsPage /> },
              { path: 'role-permissions', element: <RolePermissionsPage /> },
            ],
          },
          { path: 'users', element: <UsersPage /> },
        ],
      },
      { path: '*', element: <Navigate to="/tenders" replace /> },
    ],
  },
])
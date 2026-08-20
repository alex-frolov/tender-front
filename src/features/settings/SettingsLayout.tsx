import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { cn } from '@/lib/utils'
import { visibleSettingsTabs } from './settingsAccess'

/**
 * Каркас раздела «Настройки»: заголовок, вкладки по правам и контент.
 *
 * Набор вкладок зависит от роли (settingsAccess): сотруднику компании видны
 * «Безопасность» и «API-ключи», администратору — ещё и webhooks, суперадмину
 * площадки — настройки площадки и права ролей.
 */
export function SettingsLayout() {
  const { user } = useAuth()
  const tabs = visibleSettingsTabs(user?.role)

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Настройки</h1>
        <p className="text-muted-foreground text-sm">
          Личная безопасность, интеграции компании и параметры площадки.
        </p>
      </div>

      <nav className="flex flex-wrap gap-1 border-b pb-2">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            title={tab.description}
            className={({ isActive }) =>
              cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground',
              )
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </div>
  )
}

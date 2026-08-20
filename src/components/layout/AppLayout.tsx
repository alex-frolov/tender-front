import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Bell,
  Building2,
  ChevronDown,
  FileCheck2,
  FileText,
  Gavel,
  LayoutDashboard,
  Search,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/features/auth/AuthContext'
import { cn } from '@/lib/utils'
import { ROLE_LABELS } from '@/lib/users'

/**
 * Пункты левого сайдбара. adminOnly — виден администраторам компании,
 * platformAdminOnly — только суперадмину площадки (модерация компаний;
 * остальным ролям API отдаёт 403).
 */
const NAV_ITEMS = [
  { to: '/', label: 'Обзор', icon: LayoutDashboard, end: true },
  { to: '/tenders', label: 'Тендеры', icon: FileText },
  { to: '/auctions', label: 'Аукционы', icon: Gavel },
  { to: '/contracts', label: 'Контракты', icon: FileCheck2 },
  { to: '/my-company', label: 'Моя компания', icon: Building2 },
  { to: '/notifications', label: 'Уведомления', icon: Bell },
  { to: '/users', label: 'Пользователи', icon: Users, adminOnly: true },
  { to: '/admin/companies', label: 'Компании', icon: ShieldCheck, platformAdminOnly: true },
  // «Настройки» видны всем: набор вкладок внутри зависит от роли (settingsAccess).
  { to: '/settings', label: 'Настройки', icon: Settings },
] as const

/** Меню пользователя в шапке: имя + роль, выпадашка с Профилем и выходом. */
function UserMenu() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(event: MouseEvent): void {
      if (menuRef.current != null && !menuRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  if (user == null) return null

  const displayName = user.name || user.email || 'Пользователь'
  const roleLabel = ROLE_LABELS[user.role ?? 'agent']

  async function handleLogout(): Promise<void> {
    setLoggingOut(true)
    setOpen(false)
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="relative" ref={menuRef}>
      <Button variant="outline" onClick={() => setOpen((value) => !value)} aria-haspopup="menu">
        <span className="max-w-40 truncate">{displayName}</span>
        <Badge variant="secondary">{roleLabel}</Badge>
        <ChevronDown className="size-4" />
      </Button>
      {open && (
        <div
          role="menu"
          className="bg-popover text-popover-foreground absolute right-0 z-50 mt-2 w-48 rounded-md border p-1 shadow-md"
        >
          <Link
            to="/profile"
            role="menuitem"
            className="hover:bg-accent hover:text-accent-foreground flex items-center rounded-sm px-2 py-1.5 text-sm"
            onClick={() => setOpen(false)}
          >
            Профиль
          </Link>
          <Link
            to="/settings/security"
            role="menuitem"
            className="hover:bg-accent hover:text-accent-foreground flex items-center rounded-sm px-2 py-1.5 text-sm"
            onClick={() => setOpen(false)}
          >
            Безопасность
          </Link>
          <button
            type="button"
            role="menuitem"
            className="hover:bg-accent hover:text-accent-foreground text-destructive flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm"
            onClick={handleLogout}
            disabled={loggingOut}
          >
            {loggingOut ? 'Выходим…' : 'Выйти'}
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Поиск в шапке: сабмит уводит на каталог тендеров с параметром `q`
 * (`/tenders?q=…`) — тот же query-параметр, что и у фильтра «Поиск» на самой
 * странице каталога, поэтому результат шерится ссылкой и совпадает с фильтром.
 * Пустой запрос очищает поиск, а не открывает пустую выдачу.
 */
function HeaderSearch() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const onTenders = location.pathname === '/tenders'

  // На каталоге поле показывает активный запрос: правка в шапке и в фильтрах —
  // одно и то же состояние (источник — URL).
  const activeQuery = onTenders ? (searchParams.get('q') ?? '') : ''
  const [value, setValue] = useState(activeQuery)
  useEffect(() => setValue(activeQuery), [activeQuery])

  function handleSubmit(event: FormEvent): void {
    event.preventDefault()
    const query = value.trim()

    // Прочие фильтры каталога сохраняем, если уже на нём: поиск их уточняет.
    const params = new URLSearchParams(onTenders ? searchParams : undefined)
    if (query === '') {
      params.delete('q')
    } else {
      params.set('q', query)
    }
    const search = params.toString()
    navigate(search === '' ? '/tenders' : `/tenders?${search}`)
  }

  return (
    <form onSubmit={handleSubmit} role="search" className="relative ml-auto max-w-md flex-1">
      <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
      <Input
        type="search"
        placeholder="Поиск по тендерам…"
        className="pl-8"
        aria-label="Поиск по тендерам"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
    </form>
  )
}

/**
 * Общий каркас приложения: шапка (логотип, поиск, пользователь) + сайдбар + контент.
 * Контент подставляется через <Outlet />.
 * «Гостей» нет: layout под авторизацией. Для неавторизованных (страницы входа/регистрации)
 * показываем нейтральную заглушку без сайдбара и поиска — без доступа к данным.
 */
export function AppLayout() {
  const { user, isLoading } = useAuth()
  const authenticated = user != null

  // «Пользователи» — только администраторам компании, «Компании» (модерация)
  // — только суперадмину площадки.
  const isPlatformAdmin = user?.role === 'platform_admin'
  const navItems = NAV_ITEMS.filter(
    (item) =>
      (user?.role === 'admin' || !('adminOnly' in item && item.adminOnly))
      && (isPlatformAdmin || !('platformAdminOnly' in item && item.platformAdminOnly)),
  )

  return (
    <div className="flex min-h-screen flex-col bg-muted/40">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-4 border-b bg-background px-4">
        <Link to={authenticated ? '/tenders' : '/login'} className="shrink-0 font-semibold tracking-tight">
          Tender Platform
        </Link>

        {authenticated && <HeaderSearch />}

        {isLoading ? (
          <span className="text-muted-foreground text-sm">Проверяем сессию…</span>
        ) : authenticated ? (
          <UserMenu />
        ) : (
          <span className="text-muted-foreground ml-auto text-sm">
            <Link to="/login" className="underline-offset-4 hover:text-foreground hover:underline">
              Требуется вход
            </Link>
          </span>
        )}
      </header>

      <div className="flex flex-1">
        {authenticated && (
          <aside className="w-56 shrink-0 border-r bg-background">
            <nav className="sticky top-14 flex flex-col gap-1 p-2">
              {navItems.map((item) => {
                const Icon = item.icon
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    // Корень активен только на самом корне: без end пункт
                    // «Обзор» подсвечивался бы на всех вложенных роутах.
                    end={'end' in item && item.end}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-accent text-accent-foreground'
                          : 'text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground',
                      )
                    }
                  >
                    <Icon className="size-4 shrink-0" />
                    {item.label}
                  </NavLink>
                )
              })}
            </nav>
          </aside>
        )}

        <main className="min-w-0 flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
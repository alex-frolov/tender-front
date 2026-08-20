import type { components } from '@/api/schema'

type UserRole = components['schemas']['UserRole']

/** Вкладка раздела «Настройки». */
export interface SettingsTab {
  to: string
  label: string
  /** Роли, которым вкладка показывается; пусто — всем. */
  roles?: readonly UserRole[]
  description: string
}

/**
 * Вкладки раздела «Настройки» и их видимость.
 *
 * Видимость вкладки — это НЕ авторизация: она только убирает из меню то, что
 * заведомо ответит 403. Право проверяет бэкенд, поэтому каждая страница ещё и
 * обрабатывает отказ (см. AccessDeniedCard).
 *
 * Матрица прав (проверена по воутерам бэкенда):
 *   - `/permissions`, `/role-permissions` (GET и PUT) — только platform_admin
 *     (`#[IsGranted(PLATFORM_ADMIN)]` на контроллерах);
 *   - `PUT /platform/timezone` — только platform_admin (PlatformVoter: явная
 *     проверка роли, т.к. admin компании проходит любую проверку прав);
 *   - `GET /platform/timezone`, `GET /rate-limits` — любой аутентифицированный;
 *   - `/webhooks/*` — право `webhooks.manage` (admin и platform_admin — всегда,
 *     manager/agent — если суперадмин выдал право);
 *   - `/api-keys/*` — право `api_keys.manage` (те же правила).
 *
 * Вкладка «API-ключи» показана всем ролям намеренно: право `api_keys.manage`
 * настраиваемое, и жёсткий фильтр по роли спрятал бы раздел у менеджера,
 * которому право выдали. Если права нет — страница честно покажет отказ.
 */
export const SETTINGS_TABS: readonly SettingsTab[] = [
  {
    to: '/settings/security',
    label: 'Безопасность',
    description: 'Двухфакторная аутентификация',
  },
  {
    to: '/settings/api-keys',
    label: 'API-ключи',
    description: 'Ключи для доступа к API от имени компании',
  },
  {
    to: '/settings/webhooks',
    label: 'Webhooks',
    description: 'Подписки на события площадки',
    roles: ['admin', 'platform_admin'],
  },
  {
    to: '/settings/platform',
    label: 'Площадка',
    description: 'Таймзона и лимиты запросов',
    roles: ['platform_admin'],
  },
  {
    to: '/settings/role-permissions',
    label: 'Права ролей',
    description: 'Наборы прав ролей «Менеджер» и «Агент»',
    roles: ['platform_admin'],
  },
]

/** Вкладки, доступные роли (роль не задана — пользователь не загружен). */
export function visibleSettingsTabs(role: UserRole | undefined): readonly SettingsTab[] {
  if (role == null) return []
  return SETTINGS_TABS.filter((tab) => tab.roles == null || tab.roles.includes(role))
}

import { client, unwrap } from './client'
import type { components, operations } from './schema'

export type Permission = components['schemas']['Permission']
export type RolePermission = components['schemas']['RolePermission']

/**
 * Роль, которой можно менять набор прав (тело PUT /role-permissions).
 * Уже UserRole: admin/platform_admin имеют полный набор всегда и не
 * настраиваются, поэтому в контракте остались только manager и agent.
 */
export type ConfigurableRole = NonNullable<
  operations['updateRolePermissions']
>['requestBody']['content']['application/json']['role']

/** Группа каталога прав (Permission.group). */
export type PermissionGroup = NonNullable<Permission['group']>

/** Текущие лимиты запросов (GET /rate-limits). */
export type RateLimits = operations['getRateLimits']['responses'][200]['content']['application/json']

/** Каталог прав площадки (GET /permissions, только platform_admin). */
export async function listPermissions(): Promise<Permission[]> {
  const result = await client.GET('/permissions')
  const data = await unwrap(result)
  return data.items ?? []
}

/**
 * Наборы прав настраиваемых ролей (GET /role-permissions, только platform_admin).
 * Ответ — карта «роль → список прав»; ключи не типизированы схемой, поэтому
 * приводим их к ConfigurableRole на месте использования.
 */
export async function getRolePermissions(): Promise<Record<string, RolePermission[]>> {
  const result = await client.GET('/role-permissions')
  const data = await unwrap(result)
  return data.roles ?? {}
}

/**
 * Замена набора прав роли (PUT /role-permissions, только platform_admin).
 * Применяется немедленно; тело — полная карта «код права → включено».
 */
export async function updateRolePermissions(
  role: ConfigurableRole,
  permissions: Record<string, boolean>,
): Promise<RolePermission[]> {
  const result = await client.PUT('/role-permissions', { body: { role, permissions } })
  const data = await unwrap(result)
  return data.permissions ?? []
}

/** Доменная таймзона площадки (GET /platform/timezone, доступно всем). */
export async function getPlatformTimezone(): Promise<string | null> {
  const result = await client.GET('/platform/timezone')
  const data = await unwrap(result)
  return data.timezone_default ?? null
}

/**
 * Смена доменной таймзоны (PUT /platform/timezone, только platform_admin).
 * Влияет на расчёт сроков процедур, поэтому меняется осознанно.
 */
export async function updatePlatformTimezone(timezone: string): Promise<string | null> {
  const result = await client.PUT('/platform/timezone', {
    body: { timezone_default: timezone },
  })
  const data = await unwrap(result)
  return data.timezone_default ?? null
}

/** Потребление лимитов тенантом за период (GET /usage). */
export type Usage = operations['getUsage']['responses'][200]['content']['application/json']

/** Период, за который считается потребление (query-параметр `period`). */
export type UsagePeriod = NonNullable<
  NonNullable<operations['getUsage']['parameters']['query']>['period']
>

/**
 * Потребление лимитов своей компании (GET /usage): запросы по видам действий,
 * события и доставки вебхуков за сутки или месяц.
 *
 * Данные биллинговые, поэтому доступ — от admin компании (agent/manager → 403),
 * а сотруднику без компании бэкенд отвечает 409: считать потребление не для кого.
 */
export async function getUsage(period: UsagePeriod): Promise<Usage> {
  const result = await client.GET('/usage', { params: { query: { period } } })
  return unwrap(result)
}

/** Текущие лимиты: глобальный и по тендерам (GET /rate-limits). */
export async function getRateLimits(): Promise<RateLimits> {
  const result = await client.GET('/rate-limits')
  return unwrap(result)
}

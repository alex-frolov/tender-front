import { client, unwrap } from './client'
import type { components, operations } from './schema'

export type User = components['schemas']['User']
export type UserRole = components['schemas']['UserRole']
export type ApiError = components['schemas']['Error']

/**
 * Роль, которую можно назначить через API компании (тело POST /users).
 * Уже UserRole: platform_admin — системная роль, она создаётся только
 * консольной командой app:create:platform-admin и в приглашении невозможна.
 * Тип берётся из схемы операции, а не пишется руками, — при изменении
 * контракта компилятор укажет на несоответствие.
 */
export type CompanyRole = NonNullable<
  NonNullable<operations['inviteUser']['requestBody']>['content']['application/json']['role']
>

/** Список пользователей компании (GET /users, только admin). */
export async function listUsers(): Promise<User[]> {
  const result = await client.GET('/users')
  const data = await unwrap(result)
  return data.items ?? []
}

/** Приглашение сотрудника (POST /users, только admin; default роль — agent). */
export async function inviteUser(input: {
  email: string
  name: string
  role?: CompanyRole
}): Promise<User> {
  const result = await client.POST('/users', { body: input })
  return unwrap(result)
}

/** Мягкое удаление пользователя (DELETE /users/{userId}, только admin). */
export async function deleteUser(userId: string): Promise<void> {
  const result = await client.DELETE('/users/{userId}', {
    params: { path: { userId } },
  })
  if (result.error !== undefined) {
    throw result.error as ApiError
  }
}
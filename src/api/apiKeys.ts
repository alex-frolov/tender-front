import { client, unwrap } from './client'
import type { components, operations } from './schema'

export type ApiKey = components['schemas']['ApiKey']

/** Scope ключа — закрытый каталог из контракта (ApiKeyScopes на бэкенде). */
export type ApiKeyScope = components['schemas']['ApiKeyScope']

/**
 * Ответ на выпуск/ротацию ключа: сам ключ + СЫРОЙ токен.
 * Токен возвращается ровно один раз (в списке его уже нет — хранится только
 * хэш), поэтому UI обязан показать его пользователю сразу.
 */
export type IssuedApiKey =
  operations['createApiKey']['responses'][201]['content']['application/json']

/** Тело POST /api-keys. */
export type ApiKeyCreate = operations['createApiKey']['requestBody']['content']['application/json']

/** Ключи компании (GET /api-keys, право api_keys.manage). */
export async function listApiKeys(): Promise<ApiKey[]> {
  const result = await client.GET('/api-keys')
  const data = await unwrap(result)
  return data.items ?? []
}

/** Выпуск ключа (POST /api-keys, 201 → ключ + токен, показывается один раз). */
export async function createApiKey(input: ApiKeyCreate): Promise<IssuedApiKey> {
  const result = await client.POST('/api-keys', { body: input })
  return unwrap(result)
}

/** Отзыв ключа (DELETE /api-keys/{id}, 204): аутентификация по нему → 401. */
export async function revokeApiKey(apiKeyId: string): Promise<void> {
  const result = await client.DELETE('/api-keys/{apiKeyId}', {
    params: { path: { apiKeyId } },
  })
  if (result.error !== undefined) throw result.error
}

/** Ротация (POST /api-keys/{id}/rotate): новый токен один раз, старый мёртв. */
export async function rotateApiKey(apiKeyId: string): Promise<IssuedApiKey> {
  const result = await client.POST('/api-keys/{apiKeyId}/rotate', {
    params: { path: { apiKeyId } },
  })
  return unwrap(result)
}

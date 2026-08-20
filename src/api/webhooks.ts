import { client, unwrap } from './client'
import type { components, operations } from './schema'

export type Webhook = components['schemas']['Webhook']
export type WebhookDelivery = components['schemas']['WebhookDelivery']
export type WebhookStatus = NonNullable<Webhook['status']>

/**
 * Подписка вместе с секретом подписи. Секрет отдаётся ровно дважды за жизнь
 * подписки — при создании и при ротации; в списке его нет (хранится хэш).
 */
export type WebhookWithSecret = components['schemas']['WebhookWithSecret']

/** Тело POST /webhooks (url + список событий обязательны). */
export type WebhookCreate =
  operations['createWebhook']['requestBody']['content']['application/json']

/** Тело PATCH /webhooks/{id} — меняются url, набор событий и активность. */
export type WebhookUpdate =
  operations['updateWebhook']['requestBody']['content']['application/json']

/** Подписки компании (GET /webhooks, право webhooks.manage). */
export async function listWebhooks(): Promise<Webhook[]> {
  const result = await client.GET('/webhooks')
  const data = await unwrap(result)
  return data.items ?? []
}

/**
 * Новая подписка (POST /webhooks, 201 → подписка + секрет).
 * Секрет для HMAC-SHA256 можно задать своим или оставить пустым — тогда его
 * генерирует бэкенд. В обоих случаях ответ содержит секрет, и это единственный
 * момент, когда его видно: дальше — только ротация.
 */
export async function createWebhook(input: WebhookCreate): Promise<WebhookWithSecret> {
  const result = await client.POST('/webhooks', { body: input })
  return unwrap(result)
}

/** Правка подписки (PATCH /webhooks/{id}). */
export async function updateWebhook(webhookId: string, input: WebhookUpdate): Promise<Webhook> {
  const result = await client.PATCH('/webhooks/{webhookId}', {
    params: { path: { webhookId } },
    body: input,
  })
  return unwrap(result)
}

/**
 * Удаление подписки (DELETE /webhooks/{id}, 204).
 *
 * В спеке у операции описан ТОЛЬКО ответ 204, поэтому openapi-fetch не выводит
 * для неё ветку `error` (тип результата — never). Рантайм при этом отдаёт
 * обычную ошибку RFC 9457 на 403/404, и молча её проглатывать нельзя —
 * достаём поле через unknown и бросаем как все остальные обёртки.
 */
export async function deleteWebhook(webhookId: string): Promise<void> {
  const result = (await client.DELETE('/webhooks/{webhookId}', {
    params: { path: { webhookId } },
  })) as unknown as { error?: unknown }
  if (result.error !== undefined) throw result.error
}

/**
 * Ротация секрета (POST /webhooks/{id}/rotate-secret).
 * Новый секрет отдаётся ОДИН раз, старый перестаёт проходить проверку сразу —
 * показать новый пользователю нужно немедленно.
 */
export async function rotateWebhookSecret(webhookId: string): Promise<WebhookWithSecret> {
  const result = await client.POST('/webhooks/{webhookId}/rotate-secret', {
    params: { path: { webhookId } },
  })
  return unwrap(result)
}

/** Журнал доставок подписки (GET /webhooks/{id}/deliveries, курсорная пагинация). */
export async function listWebhookDeliveries(
  webhookId: string,
  cursor?: string,
): Promise<{ items: WebhookDelivery[]; next_cursor: string | null }> {
  const result = await client.GET('/webhooks/{webhookId}/deliveries', {
    params: { path: { webhookId }, query: cursor != null ? { cursor } : {} },
  })
  const data = await unwrap(result)
  return { items: data.items ?? [], next_cursor: data.next_cursor ?? null }
}

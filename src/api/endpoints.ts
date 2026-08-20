import { client, unwrap } from './client'
import type { components } from './schema'

// ---------- Тендеры ----------

export interface TendersQuery {
  /** Полнотекстовый поиск (title, description, documentation). */
  q?: string
  status?: components['schemas']['TenderStatus']
  region?: string
  /** Минимальная НМЦК в minor units. */
  price_min?: number
  /** Максимальная НМЦК в minor units. */
  price_max?: number
  okpd2?: string
  law_type?: 'fz44' | 'fz223' | 'commercial'
  access_type?: 'open' | 'contract_holders'
  cursor?: string
  limit?: number
}

/** Список тендеров (курсорная пагинация: { items, next_cursor }). */
export async function listTenders(query: TendersQuery = {}) {
  const result = await client.GET('/tenders', {
    params: { query },
  })
  return unwrap(result)
}

/** Карточка тендера. */
export async function getTender(tenderId: string) {
  const result = await client.GET('/tenders/{tenderId}', {
    params: { path: { tenderId } },
  })
  return unwrap(result)
}

/** Лоты тендера возвращаются в составе карточки (Tender.lots);
 *  отдельный эндпоинт /tenders/{id}/lots реализован на бэкенде для будущих списков. */

/** Создание тендера-черновика (POST /tenders, 201 → Tender). */
export async function createTender(input: components['schemas']['TenderCreate']) {
  const result = await client.POST('/tenders', { body: input })
  return unwrap(result)
}

/** Публикация тендера (POST /tenders/{id}/publish): timeline вычисляется на бэке. */
export async function publishTender(tenderId: string) {
  const result = await client.POST('/tenders/{tenderId}/publish', {
    params: { path: { tenderId } },
  })
  return unwrap(result)
}

/** Изменение тендера до окончания приёма заявок (PATCH /tenders/{id}). */
export async function updateTender(
  tenderId: string,
  input: components['schemas']['TenderUpdate'],
) {
  const result = await client.PATCH('/tenders/{tenderId}', {
    params: { path: { tenderId } },
    body: input,
  })
  return unwrap(result)
}

/** Отзыв публикации до старта приёма заявок (POST /tenders/{id}/withdraw). */
export async function withdrawTender(tenderId: string, reason: string) {
  const result = await client.POST('/tenders/{tenderId}/withdraw', {
    params: { path: { tenderId } },
    body: { reason },
  })
  return unwrap(result)
}

/** Отмена тендера (POST /tenders/{id}/cancel): код причины обязателен. */
export async function cancelTender(
  tenderId: string,
  input: components['schemas']['CancelTenderRequest'],
) {
  const result = await client.POST('/tenders/{tenderId}/cancel', {
    params: { path: { tenderId } },
    body: input,
  })
  return unwrap(result)
}

// ---------- Аукционы ----------

/** Текущее состояние аукциона (статус, правила, таймер). */
export async function getAuctionState(auctionId: string) {
  const result = await client.GET('/auctions/{auctionId}/state', {
    params: { path: { auctionId } },
  })
  return unwrap(result)
}

/**
 * Discovery SSE-потока аукциона (Mercure): публичный URL хаба + приватная тема
 * `auction:{id}` + subscribe-JWT. Клиент коннектится через EventSource.
 */
export async function getAuctionStream(auctionId: string) {
  const result = await client.GET('/auctions/{auctionId}/stream', {
    params: { path: { auctionId } },
  })
  return unwrap(result)
}

/**
 * Discovery SSE-потока СПИСКА аукционов: один хаб, приватные темы всех живых
 * аукционов компании и один subscribe-JWT на них. Одно соединение на весь
 * список вместо EventSource на строку (лимит браузера ~6 на origin).
 */
export async function getAuctionsStream() {
  const result = await client.GET('/auctions/stream')
  return unwrap(result)
}

/** История ставок аукциона (append-only, курсорная пагинация). */
export async function getAuctionBids(auctionId: string, cursor?: string, limit?: number) {
  const result = await client.GET('/auctions/{auctionId}/bids', {
    params: {
      path: { auctionId },
      query: { cursor, limit },
    },
  })
  return unwrap(result)
}

export interface PostAuctionBidInput {
  auctionId: string
  priceMinor: number
  /** Уникальный ключ идемпотентности (см. useIdempotentMutation). */
  idempotencyKey: string
}

/**
 * Поставить ставку на аукционе (POST /auctions/{id}/bids, header Idempotency-Key).
 * В openapi-fetch v0.17 заголовки передаются в `params.header` (схема placeAuctionBid:
 * header: { 'Idempotency-Key'?: string }) — клиент кладёт их в fetch-Headers.
 */
export async function postAuctionBid({ auctionId, priceMinor, idempotencyKey }: PostAuctionBidInput) {
  const result = await client.POST('/auctions/{auctionId}/bids', {
    params: {
      path: { auctionId },
      header: { 'Idempotency-Key': idempotencyKey },
    },
    body: { price_minor: priceMinor },
  })
  return unwrap(result)
}
// ---------- Лоты тендера ----------

export type Lot = components['schemas']['Lot']
export type LotCreate = components['schemas']['LotCreate']
export type LotUpdate = components['schemas']['LotUpdate']

/** Список лотов тендера (GET /tenders/{id}/lots). В карточке лоты уже приходят в Tender.lots. */
export async function listLots(tenderId: string): Promise<Lot[]> {
  const result = await client.GET('/tenders/{tenderId}/lots', {
    params: { path: { tenderId } },
  })
  const data = await unwrap(result)
  return data.items ?? []
}

/**
 * Добавление лота (POST /tenders/{id}/lots, 201 → Lot). Номер назначает бэкенд.
 * Правка доступна до окончания приёма заявок; после добавления сервер проверяет
 * инвариант «сумма лотов = НМЦК» (409/422 lots_sum_mismatch).
 */
export async function createLot(tenderId: string, input: LotCreate): Promise<Lot> {
  const result = await client.POST('/tenders/{tenderId}/lots', {
    params: { path: { tenderId } },
    body: input,
  })
  return unwrap(result)
}

/** Изменение лота (PATCH /tenders/{id}/lots/{lotId}): меняются только переданные поля. */
export async function updateLot(
  tenderId: string,
  lotId: string,
  input: LotUpdate,
): Promise<Lot> {
  const result = await client.PATCH('/tenders/{tenderId}/lots/{lotId}', {
    params: { path: { tenderId, lotId } },
    body: input,
  })
  return unwrap(result)
}

/**
 * Удаление лота (DELETE /tenders/{id}/lots/{lotId}, 204). Последний лот удалить
 * нельзя; оставшиеся перенумеровываются 1..N, НМЦК пересчитывается на бэкенде.
 */
export async function deleteLot(tenderId: string, lotId: string): Promise<void> {
  const result = await client.DELETE('/tenders/{tenderId}/lots/{lotId}', {
    params: { path: { tenderId, lotId } },
  })
  if (result.error !== undefined) {
    throw result.error
  }
}

// ---------- Аукционы: список и создание ----------

export type AuctionListItem = components['schemas']['AuctionListItem']
export type AuctionCreate = components['schemas']['AuctionCreate']

/** Аукционы своей компании (GET /auctions). Пагинации нет: один аукцион на лот. */
export async function listAuctions(): Promise<AuctionListItem[]> {
  const result = await client.GET('/auctions')
  const data = await unwrap(result)
  return data.items ?? []
}

/**
 * Создание аукциона для лота (POST /auctions, 201 → AuctionState).
 * Канонические параметры (цена, НДС, price_basis) наследуются от лота,
 * из тела приходят только торговые: тип, шаг, лимиты, длительность.
 * Повторный аукцион на тот же лот → 409 auction_exists.
 */
export async function createAuction(input: AuctionCreate) {
  const result = await client.POST('/auctions', { body: input })
  return unwrap(result)
}

/**
 * Назначение старта торгов (POST /auctions/{id}/schedule, NEW → SCHEDULED).
 * Дата должна быть в будущем. Аукцион, созданный без scheduled_start_at,
 * остаётся в статусе «Новый» без дат — торги начнутся только после назначения.
 */
export async function scheduleAuction(auctionId: string, scheduledStartAt: string) {
  const result = await client.POST('/auctions/{auctionId}/schedule', {
    params: { path: { auctionId } },
    body: { scheduled_start_at: scheduledStartAt },
  })
  return unwrap(result)
}

/** Отмена аукциона (POST /auctions/{id}/cancel → CANCELLED); причина необязательна. */
export async function cancelAuction(auctionId: string, reason?: string) {
  const result = await client.POST('/auctions/{auctionId}/cancel', {
    params: { path: { auctionId } },
    body: reason != null && reason !== '' ? { reason } : {},
  })
  return unwrap(result)
}

// ---------- Компания ----------

export type Company = components['schemas']['Company']

export type CompanyStatus = components['schemas']['CompanyStatus']

export interface CompaniesQuery {
  /** Подстрока по названию и ИНН. */
  q?: string
  status?: CompanyStatus
  cursor?: string
  limit?: number
}

/**
 * Реестр компаний площадки (GET /admin/companies, курсорная пагинация
 * { items, next_cursor }). Доступен только platform_admin — остальным 403.
 * Не путать с GET /companies: тот отдаёт карточку СВОЕЙ компании актора.
 */
export async function listCompanies(query: CompaniesQuery = {}) {
  const result = await client.GET('/admin/companies', { params: { query } })
  return unwrap(result)
}

/**
 * Модерация компании (POST /companies/{companyId}/verify, только platform_admin):
 * approve (pending/suspended → active), reject (нужна причина),
 * suspend (active → suspended). Недопустимый переход → 409.
 */
export async function verifyCompany(
  companyId: string,
  action: 'approve' | 'reject' | 'suspend',
  reason?: string,
): Promise<Company> {
  const result = await client.POST('/companies/{companyId}/verify', {
    params: { path: { companyId } },
    body: reason != null && reason !== '' ? { action, reason } : { action },
  })
  return unwrap(result)
}

/** Правка реквизитов своей компании (PATCH /companies, только admin → иначе 403). */
export async function updateCompany(input: {
  legal_name?: string
  kpp?: string
  ogrn?: string
  address?: string
  contacts?: Record<string, unknown>
}): Promise<Company> {
  const result = await client.PATCH('/companies', { body: input })
  return unwrap(result)
}

// ---------- Контракты ----------

export type Contract = components['schemas']['Contract']
export type ContractStatus = components['schemas']['ContractStatus']

export interface ContractsQuery {
  cursor?: string
  limit?: number
  contract_status?: ContractStatus
}

/** Список контрактов (GET /contracts, курсорная пагинация { items, next_cursor }). */
export async function listContracts(query: ContractsQuery = {}) {
  const result = await client.GET('/contracts', { params: { query } })
  return unwrap(result)
}

/** Карточка контракта (GET /contracts/{id}) — стороны, суммы, привязанные тендеры. */
export async function getContract(contractId: string): Promise<Contract> {
  const result = await client.GET('/contracts/{contractId}', {
    params: { path: { contractId } },
  })
  return unwrap(result)
}

/** Отправка контракта на подпись (POST .../send-for-signature: draft → pending_signature). */
export async function sendContractForSignature(contractId: string): Promise<Contract> {
  const result = await client.POST('/contracts/{contractId}/send-for-signature', {
    params: { path: { contractId } },
  })
  return unwrap(result)
}

/** Подпись контракта стороной (POST .../sign). Статус signed — когда подписали обе. */
export async function signContract(
  contractId: string,
  party: 'customer' | 'supplier',
  signature?: string,
): Promise<Contract> {
  const result = await client.POST('/contracts/{contractId}/sign', {
    params: { path: { contractId } },
    body: { party, ...(signature != null && signature !== '' ? { signature } : {}) },
  })
  return unwrap(result)
}

// ---------- Подписки на уведомления ----------

export type NotificationSubscription = components['schemas']['NotificationSubscription']
export type NotificationSubscriptionCreate =
  components['schemas']['NotificationSubscriptionCreate']

/** Мои подписки на уведомления (GET /notifications/subscriptions). */
export async function listNotificationSubscriptions(): Promise<NotificationSubscription[]> {
  const result = await client.GET('/notifications/subscriptions')
  const data = await unwrap(result)
  return data.items ?? []
}

/** Создание подписки (POST /notifications/subscriptions, 201). */
export async function createNotificationSubscription(
  input: NotificationSubscriptionCreate,
): Promise<NotificationSubscription> {
  const result = await client.POST('/notifications/subscriptions', { body: input })
  return unwrap(result)
}

/** Включение/выключение подписки (POST .../{id}/toggle) — возвращает подписку с новым active. */
export async function toggleNotificationSubscription(
  subscriptionId: string,
): Promise<NotificationSubscription> {
  const result = await client.POST('/notifications/subscriptions/{subscriptionId}/toggle', {
    params: { path: { subscriptionId } },
  })
  return unwrap(result)
}

/**
 * Удаление подписки (DELETE /notifications/subscriptions, 204).
 * Внимание: идентификатор передаётся в query, а не в пути (так в контракте).
 */
export async function deleteNotificationSubscription(subscriptionId: string): Promise<void> {
  const result = await client.DELETE('/notifications/subscriptions', {
    params: { query: { subscriptionId } },
  })
  if (result.error !== undefined) {
    throw result.error
  }
}

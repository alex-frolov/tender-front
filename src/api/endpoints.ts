import { client, unwrap } from './client'
import type { components, operations } from './schema'

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
/**
 * Оценка исполнения заказа (POST /tenders/{id}/rating, 1–10). Выставляет
 * заказчик после завершения исполнения (аукцион в DONE или DONE_BY_CLAIM);
 * хранится в тендере (`execution_rating`).
 */
export async function rateTender(tenderId: string, rating: number) {
  const result = await client.POST('/tenders/{tenderId}/rating', {
    params: { path: { tenderId } },
    body: { execution_rating: rating },
  })
  return unwrap(result)
}

// ---------- Лоты тендера ----------

export type Lot = components['schemas']['Lot']
export type LotCreate = components['schemas']['LotCreate']
export type LotUpdate = components['schemas']['LotUpdate']

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

export type AuctionUpdate = components['schemas']['AuctionUpdate']
export type AuctionWinnerResult = components['schemas']['AuctionWinnerResult']
export type AuctionStatusResult = components['schemas']['AuctionStatusResult']

/**
 * Правка торговых параметров до старта (PATCH /auctions/{id}): тип, режим и
 * величина шага, лимиты цены, длительность шага, число продлений.
 *
 * Канонические поля лота (база цены, НДС, стартовая цена, окно до исполнения)
 * и дата старта этим методом не меняются — их нет в схеме, и лишнее поле даёт
 * 422. После старта торгов правка запрещена (409), потому что правила уже
 * заморожены в rules_snapshot.
 */
export async function updateAuction(auctionId: string, input: AuctionUpdate) {
  const result = await client.PATCH('/auctions/{auctionId}', {
    params: { path: { auctionId } },
    body: input,
  })
  return unwrap(result)
}

/**
 * Завершение торгов (POST /auctions/{id}/finish, TRADE → CHOICE): окно
 * закрывается, ставки больше не принимаются, фиксируется actual_end_at.
 *
 * Само по себе истечение таймера аукцион не закрывает — торги останавливает
 * заказчик этим вызовом (или выбором победителя, который завершит торги сам).
 */
export async function finishAuction(auctionId: string): Promise<AuctionWinnerResult> {
  const result = await client.POST('/auctions/{auctionId}/finish', {
    params: { path: { auctionId } },
  })
  return unwrap(result)
}

/**
 * Выбор победителя (POST /auctions/{id}/winner).
 *
 * Без `bidId` — автовыбор минимальной цены, только для редукциона (иначе 409
 * wrong_auction_type); при необходимости сам завершит торги. С `bidId` — ручной
 * выбор предложения для свободной цены и запроса цены из статуса «Выбор
 * победителя». Нет принятых ставок → 409 no_winner.
 */
export async function chooseAuctionWinner(
  auctionId: string,
  bidId?: string,
): Promise<AuctionWinnerResult> {
  const result = await client.POST('/auctions/{auctionId}/winner', {
    params: { path: { auctionId } },
    body: bidId != null && bidId !== '' ? { bid_id: bidId } : {},
  })
  return unwrap(result)
}

/** Начало работ по договору (POST /auctions/{id}/start-work, APPROVE → IN_WORK). */
export async function startAuctionWork(auctionId: string): Promise<AuctionStatusResult> {
  const result = await client.POST('/auctions/{auctionId}/start-work', {
    params: { path: { auctionId } },
  })
  return unwrap(result)
}

/** Исполнитель отметил выполнение (POST /auctions/{id}/mark-done, IN_WORK → DONE_BY_PERFORMER). */
export async function markAuctionDone(auctionId: string): Promise<AuctionStatusResult> {
  const result = await client.POST('/auctions/{auctionId}/mark-done', {
    params: { path: { auctionId } },
  })
  return unwrap(result)
}

/**
 * Заказчик подтвердил выполнение (POST /auctions/{id}/confirm-done → DONE).
 * Требует действующего договора (подписан или зарегистрирован), иначе 409
 * `contract_required`.
 */
export async function confirmAuctionDone(auctionId: string): Promise<AuctionStatusResult> {
  const result = await client.POST('/auctions/{auctionId}/confirm-done', {
    params: { path: { auctionId } },
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

/**
 * Карточка своей компании (GET /companies). Компания резолвится по привязке
 * пользователя — чужую не отдаст; сотруднику без компании отвечает ошибкой.
 * Доступно любой роли (минимальная — agent).
 */
export async function getMyCompany(): Promise<Company> {
  const result = await client.GET('/companies')
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

// ---------- Поиск контрагента ----------

export type CompanyBrief = components['schemas']['CompanyBrief']

/**
 * Поиск компании-контрагента по названию или ИНН (GET /companies/search).
 *
 * Нужен там, где в запрос уходит чужой `company_id`: создание договора,
 * привязка процедуры. Отдаются только подтверждённые компании и только
 * краткая карточка — реквизиты для выбора стороны не нужны.
 *
 * Запрос короче двух символов бэкенд отклоняет: выдача по пустой строке была бы
 * реестром компаний, а он доступен только суперадмину.
 */
export async function searchCompanies(q: string, limit?: number): Promise<CompanyBrief[]> {
  const result = await client.GET('/companies/search', {
    params: { query: limit == null ? { q } : { q, limit } },
  })
  const data = await unwrap(result)
  return data.items ?? []
}

// ---------- Профиль поставщика ----------

export type SupplierProfile = components['schemas']['SupplierProfile']
export type SupplierProfileUpdate = components['schemas']['SupplierProfileUpdate']

/**
 * Профиль поставщика своей компании (GET /suppliers/profile, любая роль).
 * Профиль создаётся лениво, поэтому у компании, ни разу его не заполнявшей,
 * ответ приходит с пустыми списками, а не 404.
 */
export async function getSupplierProfile(): Promise<SupplierProfile> {
  const result = await client.GET('/suppliers/profile')
  return unwrap(result)
}

/**
 * Замена профиля поставщика (PUT /suppliers/profile, только admin компании).
 *
 * Семантика именно PUT: отсутствие поля в теле бэкенд трактует как пустой
 * массив (`SupplierProfileUpdateType`), то есть очистку. Поэтому вызывающий
 * обязан передавать все три списка — в том числе `documents`, которые UI пока
 * не редактирует: иначе правка категорий молча отвязала бы документы.
 */
export async function updateSupplierProfile(
  input: Required<SupplierProfileUpdate>,
): Promise<SupplierProfile> {
  const result = await client.PUT('/suppliers/profile', { body: input })
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

// ---------- Типы договоров и структура ----------

export type ContractType = components['schemas']['ContractType']
export type ContractCreate = components['schemas']['ContractCreate']
export type ContractTender = components['schemas']['ContractTender']
export type ContractStage = components['schemas']['ContractStage']
export type ContractScope = components['schemas']['ContractScope']
export type ContractSource = components['schemas']['ContractSource']

/**
 * Каталог типов договоров (GET /contract-types, доступно любой роли).
 * Идентификатор типа — числовой, отданный строкой: это небольшой справочник
 * площадки, а не запись тенанта.
 */
export async function listContractTypes(): Promise<ContractType[]> {
  const result = await client.GET('/contract-types')
  const data = await unwrap(result)
  return data.items ?? []
}

/** Новый тип договора (POST /contract-types, только суперадмин площадки). */
export async function createContractType(input: {
  code: string
  name: string
  is_single_use?: boolean
}): Promise<ContractType> {
  const result = await client.POST('/contract-types', { body: input })
  return unwrap(result)
}

/**
 * Создание договора (POST /contracts, 201 → статус draft).
 *
 * Два сценария: рамочный договор вне тендера (`source: external`) и договор
 * по итогам процедуры (`source: tender` + `tender_id`). Создаёт заказчик
 * (право `contracts.create`), поэтому `customer_id` — всегда его компания.
 */
export async function createContract(input: ContractCreate): Promise<Contract> {
  const result = await client.POST('/contracts', { body: input })
  return unwrap(result)
}

/**
 * Привязка тендера к договору (POST /contracts/{id}/tenders).
 * Для рамочного договора (`multi_use`) их может быть несколько; у `single_use`
 * вторая привязка вернёт 409.
 */
export async function bindTenderToContract(
  contractId: string,
  input: {
    tender_id: string
    lot_id?: string
    award_id?: string
    price_net_minor: number
    vat_rate?: number
  },
): Promise<ContractTender> {
  const result = await client.POST('/contracts/{contractId}/tenders', {
    params: { path: { contractId } },
    body: input,
  })
  return unwrap(result)
}

/**
 * Этап исполнения по привязке «договор — тендер»
 * (POST /contract_tenders/{id}/stages). Номер назначается автоматически,
 * если не передан. Создают обе стороны договора.
 */
export async function createContractStage(
  contractTenderId: string,
  input: { title: string; number?: number; amount_minor?: number; due_at?: string },
): Promise<ContractStage> {
  const result = await client.POST('/contract_tenders/{contractTenderId}/stages', {
    params: { path: { contractTenderId } },
    body: input,
  })
  return unwrap(result)
}

// ---------- Претензии и обеспечение ----------

export type Claim = components['schemas']['Claim']
export type Security = components['schemas']['Security']
export type ClaimStatus = NonNullable<Claim['status']>
export type SecurityStatus = components['schemas']['SecurityStatus']
export type SecurityKind = NonNullable<Security['kind']>

/** Стадия исполнения, на которой выставлена претензия. */
export type ClaimStage = NonNullable<Claim['stage']>

/** Исход разбирательства по претензии. */
export type ClaimOutcome = NonNullable<
  NonNullable<operations['resolveClaim']['requestBody']>['content']['application/json']['outcome']
>

export interface ClaimsQuery {
  contract_id?: string
  status?: ClaimStatus
  cursor?: string
  limit?: number
}

/**
 * Претензии компании (GET /claims): и как заказчика, и как исполнителя —
 * разбирательство видят обе стороны. Выставляет и урегулирует претензию
 * только заказчик.
 */
export async function listClaims(query: ClaimsQuery = {}) {
  const result = await client.GET('/claims', { params: { query } })
  return unwrap(result)
}

/**
 * Претензия по договору (POST /claims): работы приостанавливаются, аукцион
 * переходит в статус «Претензия». Стадия должна совпадать с текущей стадией
 * исполнения (approve / in_work / done_by_performer), иначе 409.
 */
export async function createClaim(input: {
  contract_id: string
  stage: ClaimStage
  reason: string
  description?: string
  amount_minor: number
}): Promise<Claim> {
  const result = await client.POST('/claims', { body: input })
  return unwrap(result)
}

/**
 * Урегулирование претензии (POST /claims/{id}/resolve): отклонена или
 * урегулирована — работы продолжаются; удовлетворена — исполнение закрывается
 * по претензии; расторжение — аукцион отменяется.
 */
export async function resolveClaim(
  claimId: string,
  outcome: ClaimOutcome,
  resolution?: string,
): Promise<Claim> {
  const result = await client.POST('/claims/{claimId}/resolve', {
    params: { path: { claimId } },
    body: resolution != null && resolution !== '' ? { outcome, resolution } : { outcome },
  })
  return unwrap(result)
}

export interface SecuritiesQuery {
  kind?: SecurityKind
  status?: SecurityStatus
  cursor?: string
  limit?: number
}

/**
 * Обеспечение компании (GET /securities): по своим процедурам (как заказчик)
 * и внесённое ею (как исполнитель).
 */
export async function listSecurities(query: SecuritiesQuery = {}) {
  const result = await client.GET('/securities', { params: { query } })
  return unwrap(result)
}

/** Возврат обеспечения (POST /securities/{id}/release). */
export async function releaseSecurity(securityId: string) {
  const result = await client.POST('/securities/{securityId}/release', {
    params: { path: { securityId } },
  })
  return unwrap(result)
}

/** Удержание обеспечения (POST /securities/{id}/forfeit) — только заказчик. */
export async function forfeitSecurity(securityId: string) {
  const result = await client.POST('/securities/{securityId}/forfeit', {
    params: { path: { securityId } },
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

import type { components } from '@/api/schema'
import type { BadgeVariant } from '@/components/ui/badge'

/** Статусы аукциона — строго из спеки AuctionStatus (16 значений). */
export type AuctionStatus = components['schemas']['AuctionStatus']

/** Русские подписи статусов аукциона. */
export const AUCTION_STATUS_LABELS: Record<AuctionStatus, string> = {
  draft: 'Черновик',
  agreement: 'Согласование',
  new: 'Новый',
  scheduled: 'Запланирован',
  trade: 'Торги идут',
  paused: 'Пауза',
  choice: 'Выбор победителя',
  approve: 'Утверждение',
  in_work: 'В работе',
  done_by_performer: 'Выполнен исполнителем',
  done: 'Завершён',
  claim: 'Претензия',
  done_by_claim: 'Завершён по претензии',
  cancelled: 'Отменён',
  expired: 'Истёк',
  deleted: 'Удалён',
}

/** Цвета бейджей по статусам (семантика как у тендерных статусов). */
export const AUCTION_STATUS_BADGE_VARIANTS: Record<AuctionStatus, BadgeVariant> = {
  draft: 'neutral',
  agreement: 'neutral',
  new: 'info',
  scheduled: 'info',
  trade: 'warning',
  paused: 'warning',
  choice: 'violet',
  approve: 'violet',
  in_work: 'info',
  done_by_performer: 'success',
  done: 'success',
  claim: 'danger',
  done_by_claim: 'success',
  cancelled: 'danger',
  expired: 'neutral',
  deleted: 'neutral',
}

/** В торговой фазе разрешены ставки; всё остальное — кнопка ставки disabled. */
export function isAuctionTrade(status: AuctionStatus | undefined): boolean {
  return status === 'trade'
}

/**
 * Статусы, в которых имеет смысл live-подписка на аукцион (SSE):
 * торги идут, стоят на паузе или вот-вот начнутся по расписанию.
 * В остальных (новый без расписания, завершён, отменён, истёк) поток событий
 * не публикуется — подключаться незачем, иначе UI показывает «нет связи»
 * там, где связи и не должно быть.
 */
const LIVE_STATUSES: readonly AuctionStatus[] = ['scheduled', 'trade', 'paused']

export function isAuctionLive(status: AuctionStatus | undefined): boolean {
  return status != null && LIVE_STATUSES.includes(status)
}

/**
 * Торги уже позади: таймер показывать нечего, а «Торги завершены» — правда.
 * До торгов (draft/agreement/new/scheduled) статус другой: там торги ещё
 * не начинались, и это не одно и то же.
 */
const FINISHED_STATUSES: readonly AuctionStatus[] = [
  'choice',
  'approve',
  'in_work',
  'done_by_performer',
  'done',
  'claim',
  'done_by_claim',
  'cancelled',
  'expired',
  'deleted',
]

export function isAuctionFinished(status: AuctionStatus | undefined): boolean {
  return status != null && FINISHED_STATUSES.includes(status)
}

/**
 * Статусы, из которых аукцион ещё можно отменить (переход `cancel` в
 * workflow бэкенда: draft/agreement/new/scheduled/trade/paused/choice/
 * approve/in_work/claim → cancelled).
 *
 * Терминальные (done, done_by_performer, done_by_claim, cancelled, expired,
 * deleted) отмену не принимают — оттуда бэкенд отвечает 409
 * `state_transition_forbidden`, поэтому кнопку там не показываем.
 */
const CANCELLABLE_STATUSES: readonly AuctionStatus[] = [
  'draft',
  'agreement',
  'new',
  'scheduled',
  'trade',
  'paused',
  'choice',
  'approve',
  'in_work',
  'claim',
]

export function isAuctionCancellable(status: AuctionStatus | undefined): boolean {
  return status != null && CANCELLABLE_STATUSES.includes(status)
}

/** Тип аукциона (AuctionType) — русские подписи. */
export type AuctionType = components['schemas']['AuctionType']

export const AUCTION_TYPE_LABELS: Record<AuctionType, string> = {
  reduction: 'Редукцион (на понижение)',
  free_price: 'Свободная цена',
  price_request: 'Запрос цены',
}

/** Короткая подпись типа для таблиц. */
export const AUCTION_TYPE_SHORT_LABELS: Record<AuctionType, string> = {
  reduction: 'Редукцион',
  free_price: 'Свободная цена',
  price_request: 'Запрос цены',
}

/** Режим шага (StepMode): фиксированный шаг или свободное понижение. */
export type StepMode = components['schemas']['StepMode']

export const STEP_MODE_LABELS: Record<StepMode, string> = {
  fixed: 'Фиксированный шаг',
  free: 'Свободное понижение',
}

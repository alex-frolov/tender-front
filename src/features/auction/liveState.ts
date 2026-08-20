import type { components } from '@/api/schema'
import type { AuctionLiveSnapshot } from '@/hooks/useAuctionStream'

type AuctionState = components['schemas']['AuctionState']
type AuctionListItem = components['schemas']['AuctionListItem']

/**
 * Остаток шага в секундах по planned_end_at: снапшот из хаба таймер в секундах
 * не несёт (его нет в AuctionLiveSnapshot), зато несёт момент окончания шага —
 * от него и считаем. null — окончание не задано.
 */
export function remainingFromPlannedEnd(
  plannedEndAt: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (plannedEndAt == null || plannedEndAt === '') return null
  const diffMs = new Date(plannedEndAt).getTime() - now.getTime()
  if (Number.isNaN(diffMs)) return null
  return Math.max(0, Math.round(diffMs / 1000))
}

/**
 * Наложение live-снапшота на состояние аукциона из GET /auctions/{id}/state.
 *
 * Снапшот — НЕ полный AuctionState (правила торгов: тип, шаг, лимиты — в нём
 * отсутствуют), поэтому он именно накладывается на ответ query, а не заменяет
 * его: иначе после первого же SSE-события форма ставки теряла бы шаг и лимиты.
 * Снапшот чужого аукциона игнорируется.
 */
export function mergeLiveSnapshot(
  base: AuctionState | undefined,
  snapshot: AuctionLiveSnapshot | null | undefined,
): AuctionState | undefined {
  if (base == null) return base
  if (snapshot == null) return base
  if (snapshot.auction_id != null && base.id != null && snapshot.auction_id !== base.id) {
    return base
  }

  const merged: AuctionState = { ...base }
  if (snapshot.status != null) merged.status = snapshot.status
  if (snapshot.current_price_minor !== undefined) {
    merged.current_price_minor = snapshot.current_price_minor
  }
  if (snapshot.start_price_minor !== undefined) {
    merged.start_price_minor = snapshot.start_price_minor
  }
  if (snapshot.planned_end_at !== undefined) {
    merged.planned_end_at = snapshot.planned_end_at
    const remaining = remainingFromPlannedEnd(snapshot.planned_end_at)
    if (remaining != null) merged.remaining_sec = remaining
  }
  if (snapshot.extensions_count != null) merged.extensions_count = snapshot.extensions_count
  if (snapshot.version != null) merged.version = snapshot.version
  if (snapshot.updated_at != null) merged.updated_at = snapshot.updated_at

  return merged
}

/**
 * Наложение live-снапшота на строку списка аукционов (GET /auctions).
 * Обновляются цена, статус, таймер и последняя ставка — то, что меняется
 * в ходе торгов; подписи тендера/лота остаются из списка.
 */
export function mergeLiveSnapshotIntoListItem(
  item: AuctionListItem,
  snapshot: AuctionLiveSnapshot,
): AuctionListItem {
  if (snapshot.auction_id == null || snapshot.auction_id !== item.id) return item

  const merged: AuctionListItem = { ...item }
  if (snapshot.status != null) merged.status = snapshot.status
  if (snapshot.current_price_minor !== undefined) {
    merged.current_price_minor = snapshot.current_price_minor
  }
  if (snapshot.start_price_minor !== undefined) {
    merged.start_price_minor = snapshot.start_price_minor
  }
  if (snapshot.planned_end_at !== undefined) {
    merged.planned_end_at = snapshot.planned_end_at
    const remaining = remainingFromPlannedEnd(snapshot.planned_end_at)
    if (remaining != null) merged.remaining_sec = remaining
  }
  if (snapshot.last_bid_price_minor !== undefined) {
    merged.last_bid_price_minor = snapshot.last_bid_price_minor
  }
  if (snapshot.last_bid_placed_at !== undefined) {
    merged.last_bid_at = snapshot.last_bid_placed_at
  }

  return merged
}

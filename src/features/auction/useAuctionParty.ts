import { useQuery } from '@tanstack/react-query'
import { getTender } from '@/api/endpoints'
import type { components } from '@/api/schema'
import { useAuth } from '@/features/auth/AuthContext'
import { canManageTender, isTenderCustomer } from '@/lib/tenderAccess'

type AuctionBid = components['schemas']['AuctionBid']

export interface AuctionParty {
  /** Тендер аукциона; null, пока не загружен или запрос выключен. */
  tender: components['schemas']['Tender'] | null
  /** Компания актора — заказчик процедуры. */
  isCustomer: boolean
  /** Заказчик И роль с правом управления (не agent) — право auction.control. */
  canControl: boolean
}

/**
 * Роль актора в процедуре аукциона.
 *
 * Ни `AuctionState`, ни список аукционов не несут заказчика — только
 * `tender_id`. Роль в процедуре определяется единственным способом: сравнением
 * `Tender.customer_id` с компанией пользователя (`lib/tenderAccess`), поэтому
 * тендер приходится дотягивать отдельным запросом. Ключ `['tender', id]` общий
 * с карточкой тендера, так что переход оттуда данные уже прогрел.
 *
 * `enabled` позволяет не ходить за тендером там, где ответ ничего не изменит
 * (например, у агента, которому управляющие действия недоступны по роли).
 */
export function useAuctionParty(
  tenderId: string | undefined,
  enabled = true,
): AuctionParty {
  const { user } = useAuth()

  const tenderQuery = useQuery({
    queryKey: ['tender', tenderId],
    queryFn: () => getTender(tenderId ?? ''),
    enabled: enabled && tenderId != null,
  })

  const tender = tenderQuery.data ?? null

  return {
    tender,
    isCustomer: tender != null && isTenderCustomer(tender, user),
    canControl: tender != null && canManageTender(tender, user),
  }
}

/**
 * Победила ли компания актора: победившая ставка ищется по `winner_bid_id`
 * в истории ставок.
 *
 * До конца торгов `bidder_id` маскируется (аноним), после — раскрывается,
 * поэтому сравнение работает ровно в тех статусах, где оно и нужно: от выбора
 * победителя и дальше по исполнению. `bidder_id` — это компания-участник
 * (supplier_id), а не пользователь.
 */
export function isWinnerCompany(
  bids: readonly AuctionBid[],
  winnerBidId: string | null | undefined,
  companyId: string | null | undefined,
): boolean {
  if (winnerBidId == null || companyId == null) return false
  const winner = bids.find((bid) => bid.id === winnerBidId)
  return winner?.bidder_id != null && winner.bidder_id === companyId
}

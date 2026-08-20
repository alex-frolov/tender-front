import { Badge } from '@/components/ui/badge'
import {
  AUCTION_STATUS_BADGE_VARIANTS,
  AUCTION_STATUS_LABELS,
  type AuctionStatus,
} from './auctionStatus'

/**
 * Бейдж статуса аукциона. Статус приходит строкой (AuctionState.status),
 * fallback — исходное значение, если сервер прислал незнакомый статус.
 */
export function AuctionStatusBadge({ status }: { status: AuctionStatus | undefined }) {
  if (status == null) {
    return <Badge variant="neutral">—</Badge>
  }
  const label = AUCTION_STATUS_LABELS[status] ?? status
  const variant = AUCTION_STATUS_BADGE_VARIANTS[status] ?? 'neutral'
  return <Badge variant={variant}>{label}</Badge>
}
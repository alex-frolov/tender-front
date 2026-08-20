import { Badge } from '@/components/ui/badge'
import { BID_STATUS_BADGE_VARIANTS, BID_STATUS_LABELS, type BidStatus } from './bidStatus'

/**
 * Бейдж статуса заявки. Статус приходит строкой (Bid.status), fallback —
 * исходное значение, если сервер прислал незнакомый статус.
 */
export function BidStatusBadge({ status }: { status: BidStatus | undefined }) {
  if (status == null) {
    return <Badge variant="neutral">—</Badge>
  }
  return (
    <Badge variant={BID_STATUS_BADGE_VARIANTS[status] ?? 'neutral'}>
      {BID_STATUS_LABELS[status] ?? status}
    </Badge>
  )
}

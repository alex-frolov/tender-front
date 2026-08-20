import { Badge } from '@/components/ui/badge'
import {
  TENDER_STATUS_BADGE_VARIANTS,
  TENDER_STATUS_LABELS,
  type TenderStatus,
} from '@/lib/enums'

interface TenderStatusBadgeProps {
  status?: TenderStatus
}

/**
 * Бейдж статуса тендера: цвет — из семантической палитры
 * (TENDER_STATUS_BADGE_VARIANTS), подпись — из TENDER_STATUS_LABELS.
 * Для отсутствующего статуса — нейтральный бейдж «—».
 */
export function TenderStatusBadge({ status }: TenderStatusBadgeProps) {
  if (status == null) {
    return <Badge variant="neutral">—</Badge>
  }
  return (
    <Badge variant={TENDER_STATUS_BADGE_VARIANTS[status]}>
      {TENDER_STATUS_LABELS[status]}
    </Badge>
  )
}
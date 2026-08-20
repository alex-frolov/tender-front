import type { components } from '@/api/schema'
import type { BadgeVariant } from '@/components/ui/badge'

/** Статусы заявки — строго из спеки BidStatus. */
export type BidStatus = components['schemas']['BidStatus']

/** Русские подписи статусов заявки. */
export const BID_STATUS_LABELS: Record<BidStatus, string> = {
  draft: 'Черновик',
  submitted: 'Подана',
  withdrawn: 'Отозвана',
  admitted: 'Допущена',
  rejected: 'Отклонена',
  winning: 'Победила',
  lost: 'Проиграла',
}

/** Цвета бейджей по статусам (семантика как у тендерных и аукционных). */
export const BID_STATUS_BADGE_VARIANTS: Record<BidStatus, BadgeVariant> = {
  draft: 'neutral',
  submitted: 'info',
  withdrawn: 'neutral',
  admitted: 'success',
  rejected: 'danger',
  winning: 'success',
  lost: 'neutral',
}

/**
 * Заявка допущена к торгам: только от такой компании аукцион принимает ставки
 * (FR-1.3.2 — «Only admitted participants can place bids»). winning/lost —
 * итоги уже состоявшихся торгов, туда заявка попадает из admitted.
 */
export function isBidAdmitted(status: BidStatus | undefined): boolean {
  return status === 'admitted' || status === 'winning' || status === 'lost'
}

/** Рассматривать (допустить/отклонить) можно только поданную заявку. */
export function isBidQualifiable(status: BidStatus | undefined): boolean {
  return status === 'submitted'
}

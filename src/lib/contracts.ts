import type { components } from '@/api/schema'
import type { BadgeVariant } from '@/components/ui/badge'

/** Статус контракта — строго из спеки ContractStatus. */
export type ContractStatus = components['schemas']['ContractStatus']

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  draft: 'Черновик',
  pending_signature: 'На подписании',
  signed: 'Подписан',
  registered: 'Зарегистрирован',
  terminated: 'Расторгнут',
  expired: 'Истёк',
  deleted: 'Удалён',
}

/** Порядок статусов в фильтре — по жизненному циклу контракта. */
export const CONTRACT_STATUSES: readonly ContractStatus[] = [
  'draft',
  'pending_signature',
  'signed',
  'registered',
  'terminated',
  'expired',
  'deleted',
]

export const CONTRACT_STATUS_BADGE_VARIANTS: Record<ContractStatus, BadgeVariant> = {
  draft: 'neutral',
  pending_signature: 'warning',
  signed: 'success',
  registered: 'info',
  terminated: 'danger',
  expired: 'neutral',
  deleted: 'neutral',
}

/** Область действия: разовый (под один тендер) или рамочный (multi_use). */
export type ContractScope = components['schemas']['ContractScope']

export const CONTRACT_SCOPE_LABELS: Record<ContractScope, string> = {
  single_use: 'Разовый',
  multi_use: 'Рамочный',
}

/** Происхождение контракта. */
export type ContractSource = components['schemas']['ContractSource']

export const CONTRACT_SOURCE_LABELS: Record<ContractSource, string> = {
  tender: 'По тендеру',
  external: 'Внешний',
}

/** Статус исполнения привязанного тендера (ContractTender.status). */
export type ContractTenderStatus = components['schemas']['ContractTenderStatus']

export const CONTRACT_TENDER_STATUS_LABELS: Record<ContractTenderStatus, string> = {
  pending: 'Ожидает',
  in_work: 'В работе',
  done_by_performer: 'Выполнен исполнителем',
  done: 'Завершён',
  claim: 'Претензия',
  done_by_claim: 'Завершён по претензии',
  terminated: 'Расторгнут',
}

export const CONTRACT_TENDER_STATUS_BADGE_VARIANTS: Record<ContractTenderStatus, BadgeVariant> = {
  pending: 'neutral',
  in_work: 'info',
  done_by_performer: 'warning',
  done: 'success',
  claim: 'danger',
  done_by_claim: 'success',
  terminated: 'danger',
}

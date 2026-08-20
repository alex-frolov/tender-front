import type { components, operations } from '@/api/schema'
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

/** Стадия исполнения, на которой выставлена претензия (Claim.stage). */
export type ClaimStage = NonNullable<components['schemas']['Claim']['stage']>

export const CLAIM_STAGE_LABELS: Record<ClaimStage, string> = {
  approve: 'Утверждение',
  in_work: 'В работе',
  done_by_performer: 'Выполнен исполнителем',
}

/** Статус претензии (Claim.status). */
export type ClaimStatus = NonNullable<components['schemas']['Claim']['status']>

export const CLAIM_STATUS_LABELS: Record<ClaimStatus, string> = {
  draft: 'Черновик',
  submitted: 'На рассмотрении',
  resolved_rejected: 'Отклонена',
  resolved_accepted: 'Удовлетворена',
  cancelled: 'Договор расторгнут',
}

export const CLAIM_STATUS_BADGE_VARIANTS: Record<ClaimStatus, BadgeVariant> = {
  draft: 'neutral',
  submitted: 'warning',
  resolved_rejected: 'neutral',
  resolved_accepted: 'success',
  cancelled: 'danger',
}

/**
 * Исход разбирательства. Отклонение и урегулирование возвращают работы в строй,
 * удовлетворение закрывает исполнение по претензии, расторжение отменяет
 * аукцион — формулировки в UI отражают именно это последствие.
 */
export type ClaimOutcome = NonNullable<
  NonNullable<
    operations['resolveClaim']['requestBody']
  >['content']['application/json']['outcome']
>

export const CLAIM_OUTCOME_LABELS: Record<ClaimOutcome, string> = {
  rejected: 'Отклонить — работы продолжаются',
  settled: 'Урегулировать — работы продолжаются',
  accepted: 'Удовлетворить — исполнение закрыто',
  terminate_contract: 'Расторгнуть договор — аукцион отменяется',
}

/** Вид обеспечения (Security.kind): заявки или исполнения контракта. */
export type SecurityKind = NonNullable<components['schemas']['Security']['kind']>

export const SECURITY_KIND_LABELS: Record<SecurityKind, string> = {
  bid: 'Обеспечение заявки',
  contract: 'Обеспечение контракта',
}

/** Способ обеспечения (Security.type). */
export type SecurityType = NonNullable<components['schemas']['Security']['type']>

export const SECURITY_TYPE_LABELS: Record<SecurityType, string> = {
  blocked_funds: 'Блокировка средств',
  guarantee: 'Гарантия',
}

/** Статус обеспечения (SecurityStatus). */
export type SecurityStatus = components['schemas']['SecurityStatus']

export const SECURITY_STATUS_LABELS: Record<SecurityStatus, string> = {
  pending: 'Ожидается',
  active: 'Внесено',
  released: 'Возвращено',
  forfeited: 'Удержано',
}

export const SECURITY_STATUS_BADGE_VARIANTS: Record<SecurityStatus, BadgeVariant> = {
  pending: 'warning',
  active: 'info',
  released: 'success',
  forfeited: 'danger',
}

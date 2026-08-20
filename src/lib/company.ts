import type { components } from '@/api/schema'
import type { BadgeVariant } from '@/components/ui/badge'

/** Статус верификации компании (CompanyStatus). */
export type CompanyStatus = components['schemas']['CompanyStatus']

export const COMPANY_STATUS_LABELS: Record<CompanyStatus, string> = {
  pending: 'На проверке',
  active: 'Проверена',
  rejected: 'Отклонена',
  suspended: 'Приостановлена',
}

export const COMPANY_STATUS_BADGE_VARIANTS: Record<CompanyStatus, BadgeVariant> = {
  pending: 'warning',
  active: 'success',
  rejected: 'danger',
  suspended: 'neutral',
}

/** Роль компании на площадке (Company.type). */
export type CompanyType = NonNullable<components['schemas']['Company']['type']>

export const COMPANY_TYPE_LABELS: Record<CompanyType, string> = {
  customer: 'Заказчик',
  supplier: 'Поставщик',
  both: 'Заказчик и поставщик',
}

/** Статус проверки поставщика (SupplierProfile.verification_status). */
export type SupplierVerificationStatus = NonNullable<
  components['schemas']['SupplierProfile']['verification_status']
>

export const SUPPLIER_VERIFICATION_LABELS: Record<SupplierVerificationStatus, string> = {
  unverified: 'Не проверен',
  pending: 'На проверке',
  verified: 'Проверен',
}

export const SUPPLIER_VERIFICATION_BADGE_VARIANTS: Record<
  SupplierVerificationStatus,
  BadgeVariant
> = {
  unverified: 'neutral',
  pending: 'warning',
  verified: 'success',
}

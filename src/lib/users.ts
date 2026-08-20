import type { components } from '@/api/schema'

type UserRole = components['schemas']['UserRole']
type VerificationStatus = NonNullable<components['schemas']['User']['verification_status']>

/** Русские подписи ролей пользователя. */
export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Администратор',
  manager: 'Менеджер',
  agent: 'Агент',
  platform_admin: 'Суперадмин',
}

/** Русские подписи статуса верификации аккаунта. */
export const VERIFICATION_LABELS: Record<VerificationStatus, string> = {
  invited: 'Приглашён',
  email_pending: 'Ожидает подтверждения email',
  active: 'Активен',
  blocked: 'Заблокирован',
}

/** Вариант бейджа для каждого статуса верификации. */
export const VERIFICATION_BADGE_VARIANTS: Record<
  VerificationStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  invited: 'secondary',
  email_pending: 'secondary',
  active: 'default',
  blocked: 'destructive',
}
import type { components } from '@/api/schema'

type Tender = components['schemas']['Tender']
type User = components['schemas']['User']

/**
 * Заказчик процедуры — компания-тенант тендера (`Tender.customer_id`).
 *
 * Роль в процедуре нигде не приходит отдельным полем: и заказчик, и участник
 * получают один и тот же `Tender`, различает их только сравнение
 * `customer_id` с компанией пользователя. У сотрудника без компании
 * (в т.ч. у платформенного админа) роли в процедуре нет.
 */
export function isTenderCustomer(
  tender: Pick<Tender, 'customer_id'>,
  user: User | null | undefined,
): boolean {
  const companyId = user?.company_id
  return companyId != null && tender.customer_id != null && tender.customer_id === companyId
}

/**
 * Может ли пользователь управлять тендером: публиковать, править, отзывать,
 * отменять, вести лоты.
 *
 * Два независимых условия, и оба обязательны:
 *   - право по роли (`tenders.update/publish/withdraw/cancel` есть у admin и
 *     manager, у agent — нет);
 *   - принадлежность тендера своей компании: мутации на бэкенде резолвят тендер
 *     строго в тенанте актора (`TenderService::resolveTender`), поэтому чужой
 *     тендер отвечает 404 на любое действие.
 *
 * Без второй проверки участник видел у чужого тендера полный набор кнопок
 * («Редактировать», «Отменить тендер», управление лотами), которые заведомо
 * заканчивались ошибкой.
 */
export function canManageTender(
  tender: Pick<Tender, 'customer_id'>,
  user: User | null | undefined,
): boolean {
  if (user?.role == null || user.role === 'agent') return false
  return isTenderCustomer(tender, user)
}

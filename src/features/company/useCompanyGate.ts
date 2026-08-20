import { useCompanyQuery } from '@/features/company/useCompany'
import { COMPANY_STATUS_LABELS, type CompanyStatus } from '@/lib/company'

/**
 * Ограничение org_pending (FR-1.5.7): пока компания не подтверждена
 * суперадмином, заказчик не может создавать и публиковать тендеры,
 * исполнитель — подавать заявки и участвовать в торгах. Просмотр доступен всем.
 *
 * Бэкенд отвечает на такие запросы 403 с кодом `org_pending`; UI не должен
 * доводить до этой ошибки — кнопки действий гасятся заранее.
 *
 * `isLoading` отделён от `canAct`: пока профиль грузится, действий не разрешаем,
 * но и баннер «не подтверждена» не показываем — статус ещё неизвестен.
 */
export interface CompanyGate {
  status: CompanyStatus | null
  /** Компания подтверждена (verification_status = active) — действия разрешены. */
  canAct: boolean
  isLoading: boolean
}

export function useCompanyGate(): CompanyGate {
  const companyQuery = useCompanyQuery()
  const status = companyQuery.data?.verification_status ?? null

  return {
    status,
    canAct: status === 'active',
    isLoading: companyQuery.isLoading,
  }
}

/** Подсказка «почему кнопка неактивна» — одна формулировка на все экраны. */
export function companyGateHint(status: CompanyStatus | null): string {
  if (status == null) return 'Компания не определена — действие недоступно.'
  if (status === 'active') return ''
  return `Компания не подтверждена (${COMPANY_STATUS_LABELS[status]}) — создание и публикация тендеров недоступны.`
}

import { client, unwrap } from './client'
import type { components, operations } from './schema'

export type ProcurementPlan = components['schemas']['ProcurementPlan']
export type ProcurementPlanCreate = components['schemas']['ProcurementPlanCreate']

/** Позиция плана: предмет, ОКПД2, объём, срок и способ закупки. */
export type ProcurementPlanItem = NonNullable<ProcurementPlanCreate['items']>[number]

export interface PlansQuery {
  cursor?: string
  limit?: number
}

/** Планы закупок компании (GET /procurement-plans, курсорная пагинация). */
export async function listProcurementPlans(query: PlansQuery = {}) {
  const result = await client.GET('/procurement-plans', { params: { query } })
  return unwrap(result)
}

/**
 * Новый план закупок (POST /procurement-plans, только admin компании).
 * Период — календарная дата (обычно 1 января планируемого года), позиции
 * необязательны: план можно завести пустым и наполнить позже.
 */
export async function createProcurementPlan(
  input: ProcurementPlanCreate,
): Promise<ProcurementPlan> {
  const result = await client.POST('/procurement-plans', { body: input })
  return unwrap(result)
}

/** Результат проверки доступа к закрытой процедуре. */
export type TenderAccess =
  operations['checkTenderAccess']['responses'][200]['content']['application/json']

/**
 * Доступ к процедуре (GET /tenders/{id}/access).
 *
 * Осмысленно для закрытых закупок (`access_type: contract_holders`): участвовать
 * в них может только компания с действующим рамочным договором. Ответ говорит
 * не просто «нельзя», а почему — договора нет, истёк или расторгнут.
 */
export async function checkTenderAccess(tenderId: string): Promise<TenderAccess> {
  const result = await client.GET('/tenders/{tenderId}/access', {
    params: { path: { tenderId } },
  })
  return unwrap(result)
}

export type SupplierProfile = components['schemas']['SupplierProfile']

/**
 * Карточка поставщика (GET /suppliers/{supplierId}): профиль, рейтинг и
 * результаты проверок (РНП, суды — из плагина). Доступна любой роли компании.
 */
export async function getSupplier(supplierId: string): Promise<SupplierProfile> {
  const result = await client.GET('/suppliers/{supplierId}', {
    params: { path: { supplierId } },
  })
  return unwrap(result)
}

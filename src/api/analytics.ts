import { client, unwrap } from './client'
import type { operations } from './schema'

/** Ответ дашборда: счётчики компании и ближайшие дедлайны. */
export type Dashboard = operations['getDashboard']['responses'][200]['content']['application/json']

/** Горизонт ближайших дедлайнов (query-параметр `period`). */
export type DashboardPeriod = NonNullable<
  NonNullable<operations['getDashboard']['parameters']['query']>['period']
>

/** Строка дедлайна: тендер (окончание приёма заявок) или аукцион (конец торгов). */
export type Deadline = NonNullable<Dashboard['upcoming_deadlines']>[number]

/**
 * Дашборд компании (GET /dashboard): активные тендеры, свои заявки и договоры
 * плюс ближайшие сроки. `period` ограничивает горизонт дедлайнов и на счётчики
 * не влияет.
 *
 * Право `dashboard.view` настраиваемое (admin/platform_admin — всегда,
 * manager/agent — по настройке), поэтому 403 здесь ожидаем и обрабатывается
 * страницей, а не считается сбоем.
 */
export async function getDashboard(period?: DashboardPeriod): Promise<Dashboard> {
  const result = await client.GET('/dashboard', {
    params: { query: period != null ? { period } : {} },
  })
  return unwrap(result)
}

/** Статистика по тендерам (GET /stats/tenders). */
export type TenderStats = operations['getTenderStats']['responses'][200]['content']['application/json']

/** Разрез статистики: регион, ОКПД2, заказчик или период. */
export type StatsDimension = NonNullable<
  NonNullable<operations['getTenderStats']['parameters']['query']>['dimension']
>

export type StatsRow = NonNullable<TenderStats['items']>[number]

/**
 * Разрезы статистики (GET /stats/tenders): число тендеров, среднее снижение
 * цены и сумма договоров по каждому значению измерения. Даты — календарные
 * (YYYY-MM-DD), обе необязательные.
 */
export async function getTenderStats(params: {
  dimension?: StatsDimension
  from?: string
  to?: string
}): Promise<TenderStats> {
  const result = await client.GET('/stats/tenders', { params: { query: params } })
  return unwrap(result)
}

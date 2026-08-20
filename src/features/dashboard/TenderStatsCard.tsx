import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getTenderStats, type StatsDimension, type StatsRow } from '@/api/analytics'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { apiErrorMessage, isApiError } from '@/lib/errors'
import { formatMoney } from '@/lib/money'

const DIMENSIONS: readonly StatsDimension[] = ['region', 'okpd2', 'customer', 'period']

const DIMENSION_LABELS: Record<StatsDimension, string> = {
  region: 'Регион',
  okpd2: 'ОКПД2',
  customer: 'Заказчик',
  period: 'Период',
}

/** Заголовок колонки значений измерения — он же подпись разреза. */
function dimensionColumn(dimension: StatsDimension): string {
  return DIMENSION_LABELS[dimension]
}

/**
 * Столбик магнитуды: длина кодирует число тендеров относительно максимума
 * в текущей выборке. Одна серия — легенда не нужна, цвет несёт только
 * «это данные», а идентичность строки даёт подпись слева.
 */
function MagnitudeBar({ value, max }: { value: number; max: number }) {
  const share = max > 0 ? Math.max(value / max, 0) : 0
  // Минимальная видимая длина: строка с одним тендером не должна выглядеть
  // как строка с нулём.
  const width = value > 0 ? Math.max(share * 100, 2) : 0
  return (
    <div className="bg-muted h-2 w-56 overflow-hidden rounded-sm" role="presentation">
      <div
        className="bg-chart-1 h-full rounded-r-sm"
        style={{ width: `${width}%` }}
        title={`${value}`}
      />
    </div>
  )
}

/** Среднее снижение цены: доли процента здесь не нужны, но и целые врут. */
function formatPercent(value: number | undefined): string {
  if (value == null) return '—'
  return `${value.toFixed(1).replace('.', ',')} %`
}

/**
 * Статистика по тендерам (GET /stats/tenders): число процедур, среднее снижение
 * цены и сумма договоров в разрезе региона, ОКПД2, заказчика или периода.
 *
 * Форма подачи — таблица со столбиками, а не диаграмма: измерений три, и они
 * разного масштаба (штуки, проценты, деньги). Рисовать их на одной оси нельзя,
 * а три отдельные диаграммы ради одного разреза — перебор; поэтому длиной
 * кодируется только число тендеров, остальное читается числами в тех же строках.
 */
export function TenderStatsCard() {
  const [dimension, setDimension] = useState<StatsDimension>('region')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const statsQuery = useQuery({
    queryKey: ['tender-stats', dimension, from, to],
    queryFn: () =>
      getTenderStats({
        dimension,
        ...(from === '' ? {} : { from }),
        ...(to === '' ? {} : { to }),
      }),
  })

  const rows: StatsRow[] = statsQuery.data?.items ?? []
  const max = rows.reduce((acc, row) => Math.max(acc, row.tenders_total ?? 0), 0)
  const forbidden = isApiError(statsQuery.error) && statsQuery.error.code === 'forbidden'

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Статистика тендеров</CardTitle>
        <CardDescription>
          Число процедур, среднее снижение цены и сумма договоров в выбранном разрезе.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Фильтры — одной строкой над данными. */}
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Разрез</label>
            <Select
              value={dimension}
              onValueChange={(value) => setDimension(value as StatsDimension)}
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DIMENSIONS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {DIMENSION_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="stats-from" className="text-sm font-medium">
              С
            </label>
            <Input
              id="stats-from"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="w-40"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="stats-to" className="text-sm font-medium">
              По
            </label>
            <Input
              id="stats-to"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="w-40"
            />
          </div>
          {(from !== '' || to !== '') && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFrom('')
                setTo('')
              }}
            >
              Сбросить период
            </Button>
          )}
        </div>

        {statsQuery.isLoading ? (
          <p className="text-muted-foreground text-sm">Считаем статистику…</p>
        ) : forbidden ? (
          <p className="text-muted-foreground text-sm">
            Нет права на аналитику — раздел доступен по праву «dashboard.view».
          </p>
        ) : statsQuery.isError ? (
          <div className="space-y-3">
            <p className="text-destructive text-sm">
              Не удалось загрузить статистику: {apiErrorMessage(statsQuery.error)}
            </p>
            <Button variant="outline" size="sm" onClick={() => void statsQuery.refetch()}>
              Повторить
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            За выбранный период данных нет.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left text-xs">
                <th className="w-56 pb-2 font-normal">{dimensionColumn(dimension)}</th>
                {/* Полоса занимает фиксированную ширину, а не остаток строки:
                    растянутый на всю карточку столбик читается как «очень много»
                    даже там, где значение равно единице. */}
                <th className="w-56 pb-2 font-normal">Тендеров</th>
                <th className="w-20 pb-2 text-right font-normal">Всего</th>
                <th className="w-36 pb-2 text-right font-normal">Снижение цены</th>
                <th className="w-44 pb-2 text-right font-normal">Сумма договоров</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.dimension_value} className="border-b last:border-0">
                  <td className="max-w-56 truncate py-2 pr-3" title={row.dimension_value}>
                    {row.dimension_value || '—'}
                  </td>
                  <td className="py-2 pr-3">
                    <MagnitudeBar value={row.tenders_total ?? 0} max={max} />
                  </td>
                  <td className="py-2 text-right tabular-nums">{row.tenders_total ?? 0}</td>
                  <td className="py-2 text-right tabular-nums">
                    {formatPercent(row.avg_price_reduction_percent)}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {row.contracts_amount_sum_minor != null
                      ? formatMoney(row.contracts_amount_sum_minor)
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  )
}

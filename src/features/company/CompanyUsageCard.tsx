import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getUsage, type UsagePeriod } from '@/api/platform'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { apiErrorMessage } from '@/lib/errors'

const PERIOD_LABELS: Record<UsagePeriod, string> = {
  day: 'За сутки',
  month: 'За месяц',
}

const PERIODS: readonly UsagePeriod[] = ['day', 'month']

/** Плитка с одним числом. */
function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  )
}

/**
 * Потребление лимитов компанией (GET /usage): запросы по видам действий,
 * события и доставки вебхуков за сутки или месяц.
 *
 * Показывается только admin компании — бэкенд считает это биллинговыми данными
 * и остальным ролям отвечает 403. Соседний экран «Настройки площадки» с общими
 * лимитами не подходит: он для суперадмина, у которого своей компании нет.
 */
export function CompanyUsageCard() {
  const [period, setPeriod] = useState<UsagePeriod>('day')

  const usageQuery = useQuery({
    queryKey: ['usage', period],
    queryFn: () => getUsage(period),
    staleTime: 60_000,
  })

  // requests — свободная карта «действие → счётчик»: набор действий задаёт
  // бэкенд (audit_log), поэтому перечисляем что пришло, а не заранее известное.
  const requests = Object.entries(usageQuery.data?.requests ?? {}).filter(
    (entry): entry is [string, number] => typeof entry[1] === 'number',
  )
  const totalRequests = requests.reduce((sum, [, count]) => sum + count, 0)

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="text-base">Потребление лимитов</CardTitle>
          <CardDescription>
            Запросы, события и доставки вебхуков вашей компании за выбранный период.
          </CardDescription>
        </div>
        <div className="flex gap-1">
          {PERIODS.map((value) => (
            <Button
              key={value}
              size="sm"
              variant={period === value ? 'default' : 'outline'}
              onClick={() => setPeriod(value)}
            >
              {PERIOD_LABELS[value]}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {usageQuery.isLoading ? (
          <p className="text-muted-foreground text-sm">Загружаем потребление…</p>
        ) : usageQuery.isError ? (
          <div className="space-y-3">
            <p className="text-destructive text-sm">
              Не удалось загрузить потребление: {apiErrorMessage(usageQuery.error)}
            </p>
            <Button variant="outline" size="sm" onClick={() => void usageQuery.refetch()}>
              Повторить
            </Button>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric label="Запросы" value={totalRequests} />
              <Metric label="События" value={usageQuery.data?.events ?? 0} />
              <Metric label="Доставки вебхуков" value={usageQuery.data?.webhooks ?? 0} />
            </div>

            {requests.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                За период не было ни одного действия.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Действие</TableHead>
                    <TableHead className="text-right">Количество</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests
                    .sort((a, b) => b[1] - a[1])
                    .map(([action, count]) => (
                      <TableRow key={action}>
                        <TableCell className="font-mono text-xs">{action}</TableCell>
                        <TableCell className="text-right tabular-nums">{count}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

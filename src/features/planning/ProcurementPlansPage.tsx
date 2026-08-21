import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import {
  createProcurementPlan,
  listProcurementPlans,
  type ProcurementPlanItem,
} from '@/api/planning'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAuth } from '@/features/auth/AuthContext'
import { apiErrorMessage, isApiError } from '@/lib/errors'
import { formatDate } from '@/lib/format'

/**
 * Подписи статусов плана. В контракте это свободная строка (`type: string`),
 * а не enum, поэтому мапу нельзя вывести из схемы: набор значений задаёт
 * бэкенд. Неизвестный статус показываем как есть, а не прячем.
 */
const PLAN_STATUS_LABELS: Record<string, string> = {
  draft: 'Черновик',
  published: 'Опубликован',
  archived: 'В архиве',
}

/** Пустая строка позиции плана — форма начинается с одной. */
function emptyItem(): ProcurementPlanItem {
  return { subject: '', okpd2: '', volume: undefined, planned_date: '', method: '' }
}

/**
 * Планы закупок (/procurement-plans): что компания собирается закупать в периоде.
 *
 * План — витрина намерений: он не связывает с процедурой и не меняет её сроки,
 * поэтому позиции здесь свободные (предмет, ОКПД2, объём, срок, способ), а не
 * ссылки на тендеры.
 *
 * Читают план все сотрудники компании, заводит — только admin (бэкенд отвечает
 * 403 остальным, поэтому кнопку им не показываем).
 */
export function ProcurementPlansPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const isAdmin = user?.role === 'admin' || user?.role === 'platform_admin'

  const plansQuery = useQuery({
    queryKey: ['procurement-plans'],
    queryFn: () => listProcurementPlans(),
  })

  const [open, setOpen] = useState(false)
  const [period, setPeriod] = useState('')
  const [items, setItems] = useState<ProcurementPlanItem[]>([emptyItem()])
  const [error, setError] = useState<string | null>(null)

  const createMutation = useMutation({
    mutationFn: createProcurementPlan,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['procurement-plans'] })
    },
  })

  const plans = plansQuery.data?.items ?? []
  const forbidden = isApiError(plansQuery.error) && plansQuery.error.code === 'forbidden'

  function updateItem(index: number, patch: Partial<ProcurementPlanItem>): void {
    setItems((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setError(null)
    if (period === '') {
      setError('Укажите период плана.')
      return
    }

    // Пустые строки не отправляем: план можно завести и без позиций.
    const filled = items.filter((item) => (item.subject ?? '').trim() !== '')
    const payload = filled.map((item) => ({
      subject: (item.subject ?? '').trim(),
      ...(item.okpd2 != null && item.okpd2 !== '' ? { okpd2: item.okpd2.trim() } : {}),
      ...(item.volume != null ? { volume: item.volume } : {}),
      ...(item.planned_date != null && item.planned_date !== ''
        ? { planned_date: item.planned_date }
        : {}),
      ...(item.method != null && item.method !== '' ? { method: item.method.trim() } : {}),
    }))

    try {
      await createMutation.mutateAsync({
        period,
        ...(payload.length === 0 ? {} : { items: payload }),
      })
      setOpen(false)
      setPeriod('')
      setItems([emptyItem()])
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Планы закупок</h1>
          <p className="text-muted-foreground text-sm">
            Что компания планирует закупать в периоде: предметы, объёмы и сроки.
          </p>
        </div>
        {isAdmin && !open && <Button onClick={() => setOpen(true)}>Новый план</Button>}
      </div>

      {open && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Новый план</CardTitle>
            <CardDescription>
              Позиции необязательны — план можно завести пустым и наполнить позже.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="plan-period" className="text-sm font-medium">
                  Период
                </label>
                <Input
                  id="plan-period"
                  type="date"
                  value={period}
                  onChange={(event) => setPeriod(event.target.value)}
                  className="w-48"
                />
                <p className="text-muted-foreground text-xs">
                  Обычно первое число планируемого года.
                </p>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">Позиции</div>
                {items.map((item, index) => (
                  <div key={index} className="flex flex-wrap items-end gap-2">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium">Предмет</label>
                      <Input
                        value={item.subject ?? ''}
                        onChange={(event) => updateItem(index, { subject: event.target.value })}
                        placeholder="Поставка бумаги"
                        className="w-64"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium">ОКПД2</label>
                      <Input
                        value={item.okpd2 ?? ''}
                        onChange={(event) => updateItem(index, { okpd2: event.target.value })}
                        className="w-32"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium">Объём</label>
                      <Input
                        value={item.volume == null ? '' : String(item.volume)}
                        onChange={(event) => {
                          const parsed = Number(event.target.value.replace(',', '.'))
                          updateItem(index, {
                            volume: event.target.value === '' || !Number.isFinite(parsed)
                              ? undefined
                              : parsed,
                          })
                        }}
                        className="w-24"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium">Срок</label>
                      <Input
                        type="date"
                        value={item.planned_date ?? ''}
                        onChange={(event) =>
                          updateItem(index, { planned_date: event.target.value })
                        }
                        className="w-40"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium">Способ</label>
                      <Input
                        value={item.method ?? ''}
                        onChange={(event) => updateItem(index, { method: event.target.value })}
                        placeholder="аукцион"
                        className="w-36"
                      />
                    </div>
                    {items.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setItems((rows) => rows.filter((_, i) => i !== index))}
                        aria-label="Удалить позицию"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setItems((rows) => [...rows, emptyItem()])}
                >
                  <Plus className="size-4" />
                  Добавить позицию
                </Button>
              </div>

              {error != null && <p className="text-destructive text-sm">{error}</p>}

              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  Отмена
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Создаём…' : 'Создать план'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {plansQuery.isLoading ? (
        <p className="text-muted-foreground text-sm">Загружаем планы…</p>
      ) : forbidden ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-muted-foreground text-sm">
              Нет доступа к планам закупок — раздел открывается ролью компании.
            </p>
          </CardContent>
        </Card>
      ) : plansQuery.isError ? (
        <Card>
          <CardContent className="space-y-3 py-6">
            <p className="text-destructive text-sm">
              Не удалось загрузить планы: {apiErrorMessage(plansQuery.error)}
            </p>
            <Button variant="outline" onClick={() => void plansQuery.refetch()}>
              Повторить
            </Button>
          </CardContent>
        </Card>
      ) : plans.length === 0 ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-muted-foreground text-sm">Планов пока нет.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {plans.map((plan) => {
            const planItems = plan.items ?? []
            return (
              <Card key={plan.id}>
                <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
                  <CardTitle className="text-base">
                    {plan.period != null ? formatDate(plan.period) : 'Без периода'}
                  </CardTitle>
                  {plan.status != null && (
                    <Badge variant={plan.status === 'published' ? 'success' : 'secondary'}>
                      {PLAN_STATUS_LABELS[plan.status] ?? plan.status}
                    </Badge>
                  )}
                </CardHeader>
                <CardContent className="p-0">
                  {planItems.length === 0 ? (
                    <p className="text-muted-foreground px-6 pb-4 text-sm">
                      Позиции не заведены.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Предмет</TableHead>
                          <TableHead>ОКПД2</TableHead>
                          <TableHead className="text-right">Объём</TableHead>
                          <TableHead>Срок</TableHead>
                          <TableHead>Способ</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {planItems.map((item, index) => {
                          const row = item as ProcurementPlanItem
                          return (
                            <TableRow key={index}>
                              <TableCell>{row.subject ?? '—'}</TableCell>
                              <TableCell className="font-mono text-xs">
                                {row.okpd2 ?? '—'}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {row.volume ?? '—'}
                              </TableCell>
                              <TableCell>
                                {row.planned_date != null ? formatDate(row.planned_date) : '—'}
                              </TableCell>
                              <TableCell>{row.method ?? '—'}</TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

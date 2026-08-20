import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { forfeitSecurity, listSecurities, releaseSecurity } from '@/api/endpoints'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { apiErrorMessage } from '@/lib/errors'
import { formatDate } from '@/lib/format'
import { formatMoney } from '@/lib/money'
import {
  SECURITY_KIND_LABELS,
  SECURITY_STATUS_BADGE_VARIANTS,
  SECURITY_STATUS_LABELS,
  SECURITY_TYPE_LABELS,
} from '@/lib/contracts'

/**
 * Обеспечение компании (GET /securities, release/forfeit).
 *
 * Список не привязан к договору: в контракте нет фильтра по нему, а сама
 * запись ссылается на заявку или контракт полиморфно (entity_type/entity_id).
 * Поэтому раздел показывает обеспечение компании целиком — и по её процедурам
 * (как заказчика), и внесённое ею (как исполнителем).
 *
 * Возврат доступен обеим сторонам, удержание — только заказчику (право
 * contracts.create); обе операции имеют смысл лишь для внесённого обеспечения,
 * у возвращённого и удержанного переход уже выполнен.
 */
export function ContractSecurities({ canForfeit }: { canForfeit: boolean }) {
  const queryClient = useQueryClient()
  const securitiesQuery = useQuery({
    queryKey: ['securities'],
    queryFn: () => listSecurities(),
  })

  const [error, setError] = useState<string | null>(null)

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['securities'] })
  }

  const releaseMutation = useMutation({ mutationFn: releaseSecurity, onSuccess: invalidate })
  const forfeitMutation = useMutation({ mutationFn: forfeitSecurity, onSuccess: invalidate })

  const items = securitiesQuery.data?.items ?? []
  const pending = releaseMutation.isPending || forfeitMutation.isPending

  async function run(action: Promise<unknown>): Promise<void> {
    setError(null)
    try {
      await action
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">Обеспечение</h3>

      {securitiesQuery.isLoading ? (
        <p className="text-muted-foreground text-sm">Загружаем обеспечение…</p>
      ) : securitiesQuery.isError ? (
        <p className="text-destructive text-sm">
          Не удалось загрузить обеспечение: {apiErrorMessage(securitiesQuery.error)}
        </p>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground text-sm">Обеспечение не вносилось.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Вид</TableHead>
              <TableHead>Способ</TableHead>
              <TableHead className="text-right">Сумма</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Действует до</TableHead>
              <TableHead className="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const active = item.status === 'active' || item.status === 'pending'
              return (
                <TableRow key={item.id}>
                  <TableCell className="text-sm">
                    {item.kind != null ? SECURITY_KIND_LABELS[item.kind] : '—'}
                  </TableCell>
                  <TableCell className="text-sm">
                    {item.type != null ? SECURITY_TYPE_LABELS[item.type] : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {item.amount_minor != null
                      ? formatMoney(item.amount_minor, item.currency)
                      : '—'}
                  </TableCell>
                  <TableCell>
                    {item.status != null ? (
                      <Badge variant={SECURITY_STATUS_BADGE_VARIANTS[item.status]}>
                        {SECURITY_STATUS_LABELS[item.status]}
                      </Badge>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {item.valid_until != null ? formatDate(item.valid_until) : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    {active && item.id != null && (
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={pending}
                          onClick={() => void run(releaseMutation.mutateAsync(item.id ?? ''))}
                        >
                          Вернуть
                        </Button>
                        {canForfeit && (
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={pending}
                            onClick={() => void run(forfeitMutation.mutateAsync(item.id ?? ''))}
                          >
                            Удержать
                          </Button>
                        )}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}

      {error != null && <p className="text-destructive text-sm">{error}</p>}
    </div>
  )
}

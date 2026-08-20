import { useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { BadgeVariant } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { listWebhookDeliveries, type WebhookDelivery } from '@/api/webhooks'
import { useCursorPage } from '@/hooks/useCursorPage'
import { formatDateTime } from '@/lib/format'

type DeliveryStatus = NonNullable<WebhookDelivery['status']>

/** Подписи статусов доставки (WebhookDelivery.status). */
const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  pending: 'В очереди',
  delivered: 'Доставлено',
  failed: 'Ошибка (будет повтор)',
  dead: 'Отброшено',
}

const DELIVERY_STATUS_VARIANTS: Record<DeliveryStatus, BadgeVariant> = {
  pending: 'info',
  delivered: 'success',
  failed: 'warning',
  dead: 'danger',
}

/**
 * Журнал доставок подписки (GET /webhooks/{id}/deliveries).
 *
 * Доставка асинхронная и с ретраями, поэтому в журнале важны не только статус,
 * но и число попыток, время следующей и последняя ошибка — по ним видно,
 * молчит эндпоинт подписчика или отвечает ошибкой.
 */
export function WebhookDeliveries({ webhookId }: { webhookId: string }) {
  const { items, isLoading, isFetchingMore, hasMore, loadMore, reset } =
    useCursorPage<WebhookDelivery>()

  useEffect(() => {
    reset()
    void loadMore((cursor) => listWebhookDeliveries(webhookId, cursor ?? undefined))
  }, [webhookId, loadMore, reset])

  if (isLoading) {
    return <p className="text-muted-foreground p-4 text-sm">Загружаем доставки…</p>
  }

  if (items.length === 0) {
    return (
      <p className="text-muted-foreground p-4 text-sm">
        Доставок пока не было — подписка ещё не поймала ни одного события.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Событие</TableHead>
            <TableHead>Статус</TableHead>
            <TableHead>Попыток</TableHead>
            <TableHead>HTTP</TableHead>
            <TableHead>Следующая попытка</TableHead>
            <TableHead>Ошибка</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((delivery) => {
            const status = delivery.status ?? 'pending'
            return (
              <TableRow key={delivery.id}>
                <TableCell className="font-mono text-xs">{delivery.event_type || '—'}</TableCell>
                <TableCell>
                  <Badge variant={DELIVERY_STATUS_VARIANTS[status]}>
                    {DELIVERY_STATUS_LABELS[status]}
                  </Badge>
                </TableCell>
                <TableCell>{delivery.attempts ?? 0}</TableCell>
                <TableCell>{delivery.last_http_status ?? '—'}</TableCell>
                <TableCell>
                  {delivery.next_retry_at != null ? formatDateTime(delivery.next_retry_at) : '—'}
                </TableCell>
                <TableCell className="max-w-64 truncate" title={delivery.last_error ?? undefined}>
                  {delivery.last_error ?? '—'}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      {hasMore && (
        <div className="px-4 pb-4">
          <Button
            variant="outline"
            size="sm"
            disabled={isFetchingMore}
            onClick={() =>
              void loadMore((cursor) => listWebhookDeliveries(webhookId, cursor ?? undefined))
            }
          >
            {isFetchingMore ? 'Загружаем…' : 'Показать ещё'}
          </Button>
        </div>
      )}
    </div>
  )
}

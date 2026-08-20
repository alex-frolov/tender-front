import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarClock } from 'lucide-react'
import { scheduleAuction } from '@/api/endpoints'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/features/auth/AuthContext'
import { apiErrorMessage } from '@/lib/errors'
import { AUCTION_STATUS_LABELS, type AuctionStatus } from './auctionStatus'

/**
 * Назначение старта торгов (POST /auctions/{id}/schedule, NEW → SCHEDULED).
 *
 * Аукцион, созданный без `scheduled_start_at`, остаётся в статусе «Новый»
 * вообще без дат: ни старта, ни окончания, торги сами не начнутся. Эта форма —
 * единственный способ назначить старт из UI. Дальше планировщик бэкенда
 * (auctions:start-scheduled) переводит аукцион в торги в назначенный момент.
 *
 * Управление аукционом — право auction.control (admin/manager); агент видит
 * только пояснение, без формы.
 */
export function AuctionScheduleForm({
  auctionId,
  status,
}: {
  auctionId: string
  status: AuctionStatus
}) {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const canControl = user?.role != null && user.role !== 'agent'

  const [startAt, setStartAt] = useState('')
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (iso: string) => scheduleAuction(auctionId, iso),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['auction-state', auctionId] })
      void queryClient.invalidateQueries({ queryKey: ['auctions'] })
    },
  })

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setError(null)

    if (startAt.trim() === '') {
      setError('Укажите дату и время старта торгов.')
      return
    }
    // datetime-local отдаёт локальное время без зоны — переводим в ISO с зоной.
    const start = new Date(startAt)
    if (Number.isNaN(start.getTime())) {
      setError('Некорректная дата старта.')
      return
    }
    if (start.getTime() <= Date.now()) {
      setError('Дата старта должна быть в будущем.')
      return
    }

    try {
      await mutation.mutateAsync(start.toISOString())
      setStartAt('')
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="size-4" />
          Торги не запланированы
        </CardTitle>
        <p className="text-muted-foreground text-sm">
          Аукцион в статусе «{AUCTION_STATUS_LABELS[status]}»: дата старта не задана, поэтому
          нет ни начала, ни окончания торгов и ставки не принимаются. Торги начнутся
          автоматически в назначенный момент.
        </p>
      </CardHeader>
      <CardContent>
        {canControl ? (
          <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <label htmlFor="auction-schedule-start" className="text-sm font-medium">
                Старт торгов
              </label>
              <Input
                id="auction-schedule-start"
                type="datetime-local"
                value={startAt}
                onChange={(event) => setStartAt(event.target.value)}
              />
            </div>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Назначаем…' : 'Назначить старт'}
            </Button>
            {error != null && <p className="text-destructive w-full text-sm">{error}</p>}
          </form>
        ) : (
          <p className="text-muted-foreground text-sm">
            Назначить старт торгов может администратор или менеджер компании-заказчика.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

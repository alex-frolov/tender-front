import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban } from 'lucide-react'
import { cancelAuction, getTender } from '@/api/endpoints'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/features/auth/AuthContext'
import { apiErrorMessage } from '@/lib/errors'
import { canManageTender } from '@/lib/tenderAccess'
import { isAuctionCancellable, type AuctionStatus } from './auctionStatus'

/**
 * Отмена аукциона (POST /auctions/{id}/cancel → CANCELLED).
 *
 * Кнопку видит только тот, у кого действие пройдёт: право `auction.control`
 * (admin/manager, agent — 403) И своя процедура — отменяет заказчик, то есть
 * компания-тенант тендера. Роль в процедуре нигде не приходит полем, поэтому
 * тендер аукциона запрашивается отдельно и сверяется через `canManageTender`,
 * как это делает карточка тендера.
 *
 * Статус тоже проверяется заранее: из терминальных (завершён, отменён, истёк)
 * переход `cancel` не разрешён и вернул бы 409.
 */
export function AuctionCancelForm({
  auctionId,
  tenderId,
  status,
}: {
  auctionId: string
  tenderId: string | undefined
  status: AuctionStatus | undefined
}) {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Агенту право auction.control не выдаётся никогда — тендер ему не запрашиваем.
  const hasRole = user?.role != null && user.role !== 'agent'
  const tenderQuery = useQuery({
    queryKey: ['tender', tenderId],
    queryFn: () => getTender(tenderId ?? ''),
    enabled: hasRole && tenderId != null && isAuctionCancellable(status),
  })

  const mutation = useMutation({
    mutationFn: (value: string) => cancelAuction(auctionId, value),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['auction-state', auctionId] })
      void queryClient.invalidateQueries({ queryKey: ['auctions'] })
    },
  })

  const tender = tenderQuery.data
  if (!isAuctionCancellable(status) || tender == null || !canManageTender(tender, user)) {
    return null
  }

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setError(null)
    try {
      await mutation.mutateAsync(reason.trim())
      setOpen(false)
      setReason('')
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Ban className="size-4" />
          Отмена аукциона
        </CardTitle>
        {!open && (
          <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
            Отменить аукцион
          </Button>
        )}
      </CardHeader>
      {open && (
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-3">
            <p className="text-muted-foreground text-sm">
              Аукцион перейдёт в статус «Отменён». Отмена необратима: торги по этому лоту
              возобновить нельзя, а новый аукцион на лот создать не получится.
            </p>
            <div className="space-y-1.5">
              <label htmlFor="cancel-reason" className="text-sm font-medium">
                Причина
              </label>
              <Input
                id="cancel-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={500}
                placeholder="Например: закупка отменена заказчиком"
              />
              <p className="text-muted-foreground text-xs">
                Необязательна, но попадёт в журнал аудита и в событие auction.cancelled.
              </p>
            </div>

            {error != null && <p className="text-destructive text-sm">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Не отменять
              </Button>
              <Button type="submit" variant="destructive" disabled={mutation.isPending}>
                {mutation.isPending ? 'Отменяем…' : 'Подтвердить отмену'}
              </Button>
            </div>
          </form>
        </CardContent>
      )}
    </Card>
  )
}

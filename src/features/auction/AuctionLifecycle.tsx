import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Flag } from 'lucide-react'
import {
  chooseAuctionWinner,
  confirmAuctionDone,
  finishAuction,
  markAuctionDone,
  rateTender,
  startAuctionWork,
} from '@/api/endpoints'
import type { components } from '@/api/schema'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/features/auth/AuthContext'
import { apiErrorMessage } from '@/lib/errors'
import { formatMoney } from '@/lib/money'
import { AUCTION_STATUS_LABELS, type AuctionStatus } from './auctionStatus'
import { isWinnerCompany, useAuctionParty } from './useAuctionParty'

type AuctionBid = components['schemas']['AuctionBid']
type AuctionState = components['schemas']['AuctionState']

/** Подпись ставки в выпадающем списке выбора победителя. */
function bidLabel(bid: AuctionBid): string {
  const price = bid.price_display_minor ?? bid.price_minor
  const priceLabel = price != null ? formatMoney(price) : 'цена неизвестна'
  const bidder = bid.bidder_id != null ? bid.bidder_id.slice(0, 8) : 'участник скрыт'
  return `${priceLabel} · ${bidder}`
}

/**
 * Дальнейшие шаги по аукциону: завершение торгов, выбор победителя и
 * исполнение договора (start-work → mark-done → confirm-done), в конце —
 * оценка исполнения.
 *
 * Показывается ровно одно действие — то, которое разрешено текущим статусом,
 * и только той стороне, которой оно доступно:
 *   - заказчик (auction.control, роль не agent): завершение торгов, выбор
 *     победителя, подтверждение выполнения, оценка;
 *   - победитель (execution.manage): начало работ и отметка о выполнении.
 * Начать работы может любая из сторон — так же, как на бэкенде
 * (`ExecutionVoter::START_WORK` принимает execution.manage или auction.control).
 *
 * Важно: истечение таймера само по себе торги не закрывает — аукцион остаётся
 * в TRADE, пока заказчик не нажмёт «Завершить торги» (или не выберет
 * победителя, что завершит торги попутно).
 */
export function AuctionLifecycle({
  auctionId,
  state,
  bids,
}: {
  auctionId: string
  state: AuctionState | undefined
  bids: readonly AuctionBid[]
}) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const status = state?.status as AuctionStatus | undefined

  // Статусы, где вообще возможны шаги ниже: раньше тендер запрашивать незачем.
  const active =
    status === 'trade' ||
    status === 'choice' ||
    status === 'approve' ||
    status === 'in_work' ||
    status === 'done_by_performer' ||
    status === 'done' ||
    status === 'done_by_claim'

  const { tender, canControl } = useAuctionParty(state?.tender_id, active)
  const isWinner =
    user?.role !== 'agent' && isWinnerCompany(bids, state?.winner_bid_id, user?.company_id)

  const [selectedBidId, setSelectedBidId] = useState('')
  const [rating, setRating] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['auction-state', auctionId] })
    void queryClient.invalidateQueries({ queryKey: ['auction-bids', auctionId] })
    void queryClient.invalidateQueries({ queryKey: ['auctions'] })
  }

  const mutation = useMutation({
    mutationFn: async (action: () => Promise<unknown>) => await action(),
    onSuccess: invalidate,
  })

  async function run(action: () => Promise<unknown>, message: string): Promise<void> {
    setError(null)
    setDone(null)
    try {
      await mutation.mutateAsync(action)
      setDone(message)
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }

  if (!active) return null

  // Ставки, из которых можно выбрать победителя вручную.
  const acceptedBids = bids.filter((bid) => bid.status === 'accepted')
  const isReduction = state?.type === 'reduction'
  const pending = mutation.isPending

  const step = ((): { title: string; body: React.ReactNode } | null => {
    if (status === 'trade' && canControl) {
      return {
        title: 'Завершить торги',
        body: (
          <>
            <p className="text-muted-foreground text-sm">
              Торги остановятся, ставки приниматься перестанут, аукцион перейдёт в статус
              «Выбор победителя». Истёкший таймер сам торги не закрывает — это делает
              заказчик.
            </p>
            <Button
              disabled={pending}
              onClick={() => void run(() => finishAuction(auctionId), 'Торги завершены.')}
            >
              {pending ? 'Завершаем…' : 'Завершить торги'}
            </Button>
          </>
        ),
      }
    }

    if (status === 'choice' && canControl) {
      return {
        title: 'Выбор победителя',
        body: isReduction ? (
          <>
            <p className="text-muted-foreground text-sm">
              Редукцион: победитель определяется автоматически — принятая ставка с
              минимальной ценой. Если принятых ставок нет, площадка ответит отказом.
            </p>
            <Button
              disabled={pending}
              onClick={() => void run(() => chooseAuctionWinner(auctionId), 'Победитель выбран.')}
            >
              {pending ? 'Выбираем…' : 'Выбрать победителя автоматически'}
            </Button>
          </>
        ) : acceptedBids.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Принятых предложений нет — выбирать не из чего.
          </p>
        ) : (
          <>
            <p className="text-muted-foreground text-sm">
              {state?.type === 'price_request' ? 'Запрос цены' : 'Свободная цена'}: победителя
              заказчик выбирает вручную из принятых предложений.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={selectedBidId} onValueChange={setSelectedBidId}>
                <SelectTrigger className="w-80">
                  <SelectValue placeholder="Выберите предложение" />
                </SelectTrigger>
                <SelectContent>
                  {acceptedBids.map((bid) => (
                    <SelectItem key={bid.id} value={bid.id ?? ''}>
                      {bidLabel(bid)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                disabled={pending || selectedBidId === ''}
                onClick={() =>
                  void run(
                    () => chooseAuctionWinner(auctionId, selectedBidId),
                    'Победитель выбран.',
                  )
                }
              >
                {pending ? 'Назначаем…' : 'Назначить победителем'}
              </Button>
            </div>
          </>
        ),
      }
    }

    if (status === 'approve' && (canControl || isWinner)) {
      return {
        title: 'Начало работ',
        body: (
          <>
            <p className="text-muted-foreground text-sm">
              Победитель определён. Отметьте начало работ по договору — аукцион перейдёт в
              статус «В работе».
            </p>
            <Button
              disabled={pending}
              onClick={() => void run(() => startAuctionWork(auctionId), 'Работы начаты.')}
            >
              {pending ? 'Отмечаем…' : 'Начать работы'}
            </Button>
          </>
        ),
      }
    }

    if (status === 'in_work' && isWinner) {
      return {
        title: 'Отметка о выполнении',
        body: (
          <>
            <p className="text-muted-foreground text-sm">
              Работы выполнены? Отметьте это — дальше выполнение подтверждает заказчик.
            </p>
            <Button
              disabled={pending}
              onClick={() =>
                void run(() => markAuctionDone(auctionId), 'Выполнение отмечено.')
              }
            >
              {pending ? 'Отмечаем…' : 'Работы выполнены'}
            </Button>
          </>
        ),
      }
    }

    if (status === 'done_by_performer' && canControl) {
      return {
        title: 'Подтверждение выполнения',
        body: (
          <>
            <p className="text-muted-foreground text-sm">
              Исполнитель отметил выполнение. Подтверждение закрывает лот и требует
              действующего договора — без него площадка ответит отказом.
            </p>
            <Button
              disabled={pending}
              onClick={() =>
                void run(() => confirmAuctionDone(auctionId), 'Выполнение подтверждено.')
              }
            >
              {pending ? 'Подтверждаем…' : 'Подтвердить выполнение'}
            </Button>
          </>
        ),
      }
    }

    if ((status === 'done' || status === 'done_by_claim') && canControl && tender?.id != null) {
      const tenderId = tender.id
      const current = tender.execution_rating
      return {
        title: 'Оценка исполнения',
        body: (
          <>
            <p className="text-muted-foreground text-sm">
              Оценка от 1 до 10 сохраняется в тендере и учитывается в рейтинге поставщика.
              {current != null && ` Текущая оценка: ${current}.`}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={rating} onValueChange={setRating}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Оценка" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 10 }, (_, index) => String(index + 1)).map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                disabled={pending || rating === ''}
                onClick={() =>
                  void run(async () => {
                    await rateTender(tenderId, Number(rating))
                    void queryClient.invalidateQueries({ queryKey: ['tender', tenderId] })
                  }, 'Оценка сохранена.')
                }
              >
                {pending ? 'Сохраняем…' : 'Сохранить оценку'}
              </Button>
            </div>
          </>
        ),
      }
    }

    return null
  })()

  if (step == null) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Flag className="size-4" />
          {step.title}
          <span className="text-muted-foreground text-xs font-normal">
            статус: {status != null ? AUCTION_STATUS_LABELS[status] : '—'}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {step.body}
        {error != null && <p className="text-destructive text-sm">{error}</p>}
        {done != null && <p className="text-sm text-emerald-600">{done}</p>}
      </CardContent>
    </Card>
  )
}

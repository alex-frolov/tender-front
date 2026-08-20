import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Plus } from 'lucide-react'
import { getAuctionBids, getAuctionState } from '@/api/endpoints'
import type { components } from '@/api/schema'
import { FullPageSpinner } from '@/components/auth/ProtectedRoute'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  useAuctionStream,
  type AuctionLiveSnapshot,
  type AuctionStreamStatus,
} from '@/hooks/useAuctionStream'
import { apiErrorMessage } from '@/lib/errors'
import { formatDateTime, formatRemaining, formatSeconds } from '@/lib/format'
import { formatMoney } from '@/lib/money'
import { AuctionStatusBadge } from './AuctionStatusBadge'
import { AuctionCancelForm } from './AuctionCancelForm'
import { AuctionScheduleForm } from './AuctionScheduleForm'
import { BidComposer } from './BidComposer'
import { mergeLiveSnapshot } from './liveState'
import {
  AUCTION_STATUS_LABELS,
  isAuctionFinished,
  isAuctionLive,
  isAuctionTrade,
} from './auctionStatus'

type AuctionBid = components['schemas']['AuctionBid']

/**
 * Обратный отсчёт: тикает каждую секунду, пока running=true, от начального
 * remaining_sec (обновляется событиями SSE `timer`/`state`).
 */
function useCountdown(remaining: number | null | undefined, running: boolean): number {
  const [seconds, setSeconds] = useState<number>(remaining ?? 0)
  const secondsRef = useRef<number>(remaining ?? 0)

  useEffect(() => {
    const next = remaining ?? 0
    secondsRef.current = next
    setSeconds(next)
  }, [remaining])

  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => {
      secondsRef.current = Math.max(0, secondsRef.current - 1)
      setSeconds(secondsRef.current)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [running])

  return seconds
}

/** Индикатор состояния SSE-подписки: подключено / переподключение / ошибка. */
function ConnectionIndicator({
  status,
  reconnectCount,
  error,
}: {
  status: AuctionStreamStatus
  reconnectCount: number
  error: string | null
}) {
  // Подписки нет по решению страницы (аукцион вне торговой фазы) — это норма,
  // а не сбой связи: показываем нейтральную подпись вместо красного бейджа.
  if (status === 'idle') {
    return <Badge variant="neutral">Live-обновления не нужны</Badge>
  }
  if (status === 'error') {
    return <Badge variant="danger">{error ?? 'Нет связи с потоком'}</Badge>
  }
  if (status === 'open') {
    return <Badge variant="success">Подключено</Badge>
  }
  return (
    <Badge variant="warning">
      {reconnectCount > 0 ? `Переподключение… (попытка ${reconnectCount})` : 'Подключение…'}
    </Badge>
  )
}

/** Скелетон строк истории ставок. */
function BidsTableSkeleton() {
  return (
    <TableBody>
      {Array.from({ length: 4 }, (_, index) => (
        <TableRow key={index}>
          <TableCell>
            <div className="bg-muted h-4 w-28 animate-pulse rounded" />
          </TableCell>
          <TableCell>
            <div className="bg-muted h-4 w-24 animate-pulse rounded" />
          </TableCell>
          <TableCell>
            <div className="bg-muted ml-auto h-4 w-24 animate-pulse rounded" />
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  )
}

/**
 * Live-аукцион (/auctions/:auctionId):
 * - getAuctionState (query) + SSE через useAuctionStream: события `state`/`bid`/`timer`
 *   обновляют состояние на лету;
 * - история ставок getAuctionBids, новые по SSE встают в начало;
 * - BidComposer: ставка с Idempotency-Key (дублей нет).
 */
export function AuctionPage() {
  const { auctionId } = useParams<{ auctionId: string }>()

  const stateQuery = useQuery({
    queryKey: ['auction-state', auctionId],
    queryFn: () => getAuctionState(auctionId ?? ''),
    enabled: auctionId != null,
  })

  const bidsQuery = useQuery({
    queryKey: ['auction-bids', auctionId],
    queryFn: () => getAuctionBids(auctionId ?? ''),
    enabled: auctionId != null,
  })

  const queryClient = useQueryClient()

  // Live-данные с SSE поверх запросов. Хаб публикует один и тот же снапшот на
  // все имена событий (`state`/`bid`/`timer`/`status`), причём НЕполный —
  // правила торгов в нём отсутствуют, поэтому он накладывается на ответ
  // /auctions/{id}/state, а не заменяет его.
  const [liveSnapshot, setLiveSnapshot] = useState<AuctionLiveSnapshot | null>(null)

  const state = mergeLiveSnapshot(stateQuery.data, liveSnapshot)
  const status = state?.status
  const trading = isAuctionTrade(status)
  const finished = isAuctionFinished(status)

  const stream = useAuctionStream(auctionId ?? '', {
    // Поток нужен только в живых фазах (запланирован/торги/пауза). У завершённого
    // или ещё не запланированного аукциона Mercure ничего не публикует, и попытка
    // подписаться заканчивалась ложной ошибкой «Не удалось подключиться к потоку».
    enabled: isAuctionLive(status),
    onSnapshot: (snapshot, event) => {
      setLiveSnapshot(snapshot)
      // Саму ставку снапшот не несёт (только id/цену/время последней), поэтому
      // историю досматриваем запросом — иначе таблица отстаёт от торгов.
      if (event === 'bid') {
        void queryClient.invalidateQueries({ queryKey: ['auction-bids', auctionId] })
      }
    },
  })

  // Таймер: остаток шага считается из planned_end_at снапшота (mergeLiveSnapshot),
  // до первого события — из ответа /state.
  const countdown = useCountdown(state?.remaining_sec, trading)

  // Смена аукциона (переход /auctions/:a → /auctions/:b): сбрасываем live-данные,
  // иначе останется состояние предыдущего аукциона до первого SSE-события.
  useEffect(() => {
    setLiveSnapshot(null)
  }, [auctionId])

  const bids: AuctionBid[] = bidsQuery.data?.items ?? []

  const currentPriceMinor = state?.current_price_minor ?? state?.start_price_minor

  if (auctionId == null) {
    return (
      <Card>
        <CardContent>
          <p className="text-muted-foreground text-sm">Не указан идентификатор аукциона.</p>
        </CardContent>
      </Card>
    )
  }

  if (stateQuery.isLoading) {
    return <FullPageSpinner />
  }

  if (stateQuery.isError) {
    return (
      <Card>
        <CardContent className="space-y-4">
          <p className="text-destructive text-sm">
            Не удалось загрузить аукцион: {apiErrorMessage(stateQuery.error)}
          </p>
          <Button variant="outline" onClick={() => void stateQuery.refetch()}>
            Повторить
          </Button>
        </CardContent>
      </Card>
    )
  }

  // Таймер честно отражает фазу: «Торги завершены» — только когда они реально
  // были и закончились. У нового/запланированного аукциона торги ещё впереди.
  const timer = describeTimer({
    status,
    countdown,
    trading,
    finished,
    scheduledStartAt: state?.scheduled_start_at ?? null,
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link to="/auctions">
            <ArrowLeft className="size-4" />
            К списку аукционов
          </Link>
        </Button>
        <ConnectionIndicator
          status={stream.status}
          reconnectCount={stream.reconnectCount}
          error={stream.errorMessage}
        />
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-muted-foreground text-sm">{auctionId}</span>
            <AuctionStatusBadge status={state?.status} />
          </div>
          <h1 className="text-2xl font-semibold">Аукцион</h1>
        </div>

        <div className="flex flex-col gap-1 text-right">
          <span className="text-muted-foreground text-xs">Текущая цена</span>
          <span className="text-2xl font-bold tabular-nums">
            {currentPriceMinor != null ? formatMoney(currentPriceMinor) : '—'}
          </span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <span className="text-muted-foreground text-xs">Таймер</span>
            <span className="text-xl font-bold tabular-nums">{timer.value}</span>
            {timer.hint != null && (
              <span className="text-muted-foreground text-xs">{timer.hint}</span>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <span className="text-muted-foreground text-xs">Стартовая цена</span>
            <span className="text-xl font-bold tabular-nums">
              {state?.start_price_minor != null ? formatMoney(state.start_price_minor) : '—'}
            </span>
          </CardContent>
        </Card>
      </div>

      {(status === 'new' || status === 'draft' || status === 'agreement') && (
        <AuctionScheduleForm auctionId={auctionId} status={status} />
      )}

      <AuctionCancelForm
        auctionId={auctionId}
        tenderId={state?.tender_id}
        status={status}
      />

      {trading && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Сделать ставку</CardTitle>
          </CardHeader>
          <CardContent>
            <BidComposer auctionId={auctionId} state={state} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">История ставок</CardTitle>
          {stream.lastEvent != null && stream.status === 'open' && (
            <span className="text-muted-foreground flex items-center gap-1 text-xs">
              <Plus className="size-3" />
              live: {stream.lastEvent}
            </span>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {bidsQuery.isLoading && bids.length === 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-44">Время</TableHead>
                  <TableHead>Участник</TableHead>
                  <TableHead className="text-right">Цена</TableHead>
                  <TableHead>Статус</TableHead>
                </TableRow>
              </TableHeader>
              <BidsTableSkeleton />
            </Table>
          ) : bidsQuery.isError ? (
            <div className="space-y-4 px-6 py-4">
              <p className="text-destructive text-sm">
                Не удалось загрузить ставки: {apiErrorMessage(bidsQuery.error)}
              </p>
              <Button variant="outline" onClick={() => void bidsQuery.refetch()}>
                Повторить
              </Button>
            </div>
          ) : bids.length === 0 ? (
            <p className="text-muted-foreground px-6 py-4 text-sm">Ставок пока нет.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-44">Время</TableHead>
                  <TableHead>Участник</TableHead>
                  <TableHead className="text-right">Цена</TableHead>
                  <TableHead>Статус</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bids.map((bid) => (
                  <TableRow key={bid.id}>
                    <TableCell className="text-muted-foreground">
                      {bid.placed_at != null ? formatDateTime(bid.placed_at) : '—'}
                    </TableCell>
                    <TableCell>
                      {bid.bidder_id == null ? (
                        <span className="text-muted-foreground">Аноним</span>
                      ) : (
                        <span className="font-mono text-xs">{bid.bidder_id}</span>
                      )}
                    </TableCell>
                    <TableCell className="font-semibold text-right tabular-nums">
                      {bid.price_display_minor != null
                        ? formatMoney(bid.price_display_minor)
                        : bid.price_minor != null
                          ? formatMoney(bid.price_minor)
                          : '—'}
                    </TableCell>
                    <TableCell>
                      {bid.status === 'accepted' ? (
                        <Badge variant="success">Принята</Badge>
                      ) : bid.status === 'rejected' ? (
                        <Badge variant="danger">Отклонена</Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/** Что показать в карточке таймера для текущей фазы аукциона. */
interface TimerView {
  value: string
  hint?: string
}

function describeTimer({
  status,
  countdown,
  trading,
  finished,
  scheduledStartAt,
}: {
  status: components['schemas']['AuctionStatus'] | undefined
  countdown: number
  trading: boolean
  finished: boolean
  scheduledStartAt: string | null
}): TimerView {
  if (trading) {
    return countdown <= 0
      ? { value: '00:00', hint: 'Время шага истекло — ждём завершения торгов' }
      : { value: formatSeconds(countdown) }
  }

  if (status === 'paused') {
    return {
      value: formatSeconds(countdown),
      hint: 'Торги на паузе — таймер заморожен',
    }
  }

  if (status === 'scheduled') {
    return scheduledStartAt != null
      ? {
          value: formatDateTime(scheduledStartAt),
          hint: `Старт торгов · ${formatRemaining(scheduledStartAt)}`,
        }
      : { value: 'Запланирован', hint: 'Дата старта не задана' }
  }

  if (finished) {
    return {
      value: 'Торги завершены',
      hint: status != null ? `Статус: ${AUCTION_STATUS_LABELS[status]}` : undefined,
    }
  }

  // draft / agreement / new — торги ещё не назначены.
  return {
    value: 'Торги не начинались',
    hint: 'Дата старта не назначена — торги не запланированы',
  }
}

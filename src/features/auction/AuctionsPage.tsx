import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { listAuctions } from '@/api/endpoints'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { AuctionStatusBadge } from '@/features/auction/AuctionStatusBadge'
import {
  AUCTION_STATUS_LABELS,
  AUCTION_TYPE_SHORT_LABELS,
  isAuctionLive,
  type AuctionStatus,
} from '@/features/auction/auctionStatus'
import { mergeLiveSnapshotIntoListItem } from '@/features/auction/liveState'
import { StreamIndicator } from '@/features/auction/StreamIndicator'
import { useAuctionsStream } from '@/hooks/useAuctionsStream'
import type { AuctionLiveSnapshot } from '@/hooks/useAuctionStream'
import { apiErrorMessage } from '@/lib/errors'
import { formatDateTime, formatRemaining, formatSeconds } from '@/lib/format'
import { formatMoney } from '@/lib/money'

/** Специальное значение «все» для Select — Radix не принимает пустую строку. */
const ALL_VALUE = 'all'

/** Подпись лота в строке: «лот 3 · Экскаватор», без выдуманных значений. */
function lotLabel(number: number | null | undefined, title: string | null | undefined): string {
  const parts = [
    number != null ? `лот ${number}` : 'лот',
    title != null && title !== '' ? title : null,
  ].filter((part) => part != null)
  return parts.join(' · ')
}

/**
 * Список аукционов компании (GET /auctions).
 * Пагинации в контракте нет — один аукцион на лот, объём ограничен бизнес-флоу,
 * поэтому фильтр по статусу применяется на клиенте.
 * Колонка «Последняя ставка» — last_bid_price_minor/last_bid_at из строки
 * списка (личность участника API не отдаёт: торги анонимны).
 *
 * Live: страница держит ОДНО SSE-соединение на все живые торги
 * (`useAuctionsStream` → GET /auctions/stream) и накладывает приходящие
 * снапшоты на строки списка. Без этого цена и последняя ставка в таблице
 * менялись только по кнопке «Обновить»: запрос кэшируется, а сам по себе
 * список не перезапрашивается.
 *
 * Живые торги чужих компаний в этот поток не входят (discovery отдаёт topic'и
 * только своего тенанта, см. спеку GET /auctions/stream) — такие строки
 * обновляются на карточке аукциона, куда ведёт ссылка из таблицы.
 */
export function AuctionsPage() {
  const [statusFilter, setStatusFilter] = useState<string>(ALL_VALUE)
  // Последний снапшот по каждому аукциону: накладывается на строку списка.
  const [snapshots, setSnapshots] = useState<Record<string, AuctionLiveSnapshot>>({})

  const auctionsQuery = useQuery({
    queryKey: ['auctions'],
    queryFn: listAuctions,
    staleTime: 15_000,
  })

  const rows = useMemo(() => auctionsQuery.data ?? [], [auctionsQuery.data])

  const handleSnapshot = useCallback((snapshot: AuctionLiveSnapshot) => {
    const auctionId = snapshot.auction_id
    if (auctionId == null || auctionId === '') return
    setSnapshots((current) => ({ ...current, [auctionId]: snapshot }))
  }, [])

  // Подписываемся, только если в списке есть торги, которые реально что-то
  // публикуют: иначе discovery отдаст пустые topic'и и страница показывала бы
  // «нет связи» там, где связи и не должно быть.
  const hasLive = useMemo(() => rows.some((auction) => isAuctionLive(auction.status)), [rows])
  const stream = useAuctionsStream({ onSnapshot: handleSnapshot, enabled: hasLive })

  const auctions = useMemo(
    () =>
      rows.map((auction) => {
        const snapshot = auction.id != null ? snapshots[auction.id] : undefined
        return snapshot == null ? auction : mergeLiveSnapshotIntoListItem(auction, snapshot)
      }),
    [rows, snapshots],
  )

  // Статусы для фильтра — только те, что реально встречаются в списке.
  const presentStatuses = useMemo(() => {
    const set = new Set<AuctionStatus>()
    for (const auction of auctions) {
      if (auction.status != null) set.add(auction.status)
    }
    return [...set]
  }, [auctions])

  const visible = useMemo(
    () =>
      statusFilter === ALL_VALUE
        ? auctions
        : auctions.filter((auction) => auction.status === statusFilter),
    [auctions, statusFilter],
  )

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Аукционы</h1>
        <p className="text-muted-foreground text-sm">
          Аукционы вашей компании: статус, текущая цена и таймер торгов.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Статус</label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Все статусы" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>Все статусы</SelectItem>
              {presentStatuses.map((status) => (
                <SelectItem key={status} value={status}>
                  {AUCTION_STATUS_LABELS[status] ?? status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="ghost"
          onClick={() => void auctionsQuery.refetch()}
          disabled={auctionsQuery.isFetching}
        >
          {auctionsQuery.isFetching ? 'Обновляем…' : 'Обновить'}
        </Button>
        <div className="ml-auto pb-2">
          <StreamIndicator
            status={stream.status}
            reconnectCount={stream.reconnectCount}
            error={stream.errorMessage}
            idleLabel="Живых торгов нет"
          />
        </div>
      </div>

      {auctionsQuery.isError ? (
        <Card>
          <CardContent className="space-y-4">
            <p className="text-destructive text-sm">
              Не удалось загрузить аукционы: {apiErrorMessage(auctionsQuery.error)}
            </p>
            <Button variant="outline" onClick={() => void auctionsQuery.refetch()}>
              Повторить
            </Button>
          </CardContent>
        </Card>
      ) : auctionsQuery.isLoading ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-muted-foreground text-sm">Загружаем аукционы…</p>
          </CardContent>
        </Card>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-muted-foreground text-sm">
              {auctions.length === 0 ? 'Аукционов нет' : 'Нет аукционов с таким статусом'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Статус</TableHead>
                  <TableHead>Тендер / лот</TableHead>
                  <TableHead>Тип</TableHead>
                  <TableHead className="text-right">Текущая цена</TableHead>
                  <TableHead className="text-right">Последняя ставка</TableHead>
                  <TableHead>Начало торгов</TableHead>
                  <TableHead>Окончание торгов</TableHead>
                  <TableHead className="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((auction) => {
                  const price = auction.current_price_minor ?? auction.start_price_minor
                  const isStartPrice =
                    auction.current_price_minor == null && auction.start_price_minor != null
                  return (
                    <TableRow key={auction.id}>
                      <TableCell>
                        <AuctionStatusBadge status={auction.status} />
                      </TableCell>
                      <TableCell>
                        {auction.tender_id != null ? (
                          <Link
                            to={`/tenders/${auction.tender_id}`}
                            className="font-medium underline-offset-4 hover:underline"
                            title={auction.tender_number ?? auction.tender_id}
                          >
                            {auction.tender_title || auction.tender_number || 'Тендер'}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                        <div className="text-muted-foreground text-xs" title={auction.lot_id}>
                          {auction.tender_number != null && `${auction.tender_number} · `}
                          {lotLabel(auction.lot_number, auction.lot_title)}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {auction.type != null
                          ? AUCTION_TYPE_SHORT_LABELS[auction.type] ?? auction.type
                          : '—'}
                        {auction.no_start_price === true && (
                          <Badge variant="neutral" className="ml-2">
                            без старт. цены
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {price != null ? formatMoney(price) : '—'}
                        {isStartPrice && (
                          <div className="text-muted-foreground text-xs font-normal">стартовая</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {/* Цена и время последней принятой ставки (API отдаёт их
                            в строке списка). Участник не раскрывается — торги
                            анонимны до окончания, а цена публична, как и
                            текущая цена слева. */}
                        {auction.last_bid_at != null ? (
                          <>
                            <div className="font-semibold tabular-nums">
                              {auction.last_bid_price_minor != null
                                ? formatMoney(auction.last_bid_price_minor)
                                : '—'}
                            </div>
                            <div className="text-muted-foreground text-xs">
                              {formatDateTime(auction.last_bid_at)}
                            </div>
                          </>
                        ) : (
                          <span className="text-muted-foreground">ставок нет</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {/* Фактический старт важнее планового: у идущих торгов
                            показываем started_at, у запланированных — назначенное время. */}
                        {auction.started_at != null ? (
                          <>
                            <div>{formatDateTime(auction.started_at)}</div>
                            <div className="text-muted-foreground text-xs">торги начались</div>
                          </>
                        ) : auction.scheduled_start_at != null ? (
                          <>
                            <div>{formatDateTime(auction.scheduled_start_at)}</div>
                            <div className="text-muted-foreground text-xs">
                              {formatRemaining(auction.scheduled_start_at)}
                            </div>
                          </>
                        ) : (
                          <span className="text-muted-foreground">не запланированы</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {auction.planned_end_at != null ? (
                          <>
                            <div>{formatDateTime(auction.planned_end_at)}</div>
                            <div className="text-muted-foreground text-xs tabular-nums">
                              {auction.remaining_sec != null
                                ? formatSeconds(auction.remaining_sec)
                                : formatRemaining(auction.planned_end_at)}
                            </div>
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild variant="outline" size="sm">
                          <Link to={`/auctions/${auction.id}`}>Открыть</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

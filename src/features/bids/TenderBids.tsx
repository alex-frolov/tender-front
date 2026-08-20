import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, FilePlus2, Undo2, XCircle } from 'lucide-react'
import {
  listBids,
  qualifyBid,
  withdrawBid,
  type Bid,
  type BidDecision,
} from '@/api/bids'
import type { components } from '@/api/schema'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { useCursorPage, type CursorPageData } from '@/hooks/useCursorPage'
import { apiErrorMessage } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'
import { formatMoney } from '@/lib/money'
import { isTenderCustomer } from '@/lib/tenderAccess'
import { BidStatusBadge } from './BidStatusBadge'
import { BidSubmitForm } from './BidSubmitForm'
import { isBidAdmitted, isBidQualifiable } from './bidStatus'

type Tender = components['schemas']['Tender']

/** Подать и отозвать заявку можно только пока тендер принимает заявки. */
const ACCEPTING = 'accepting_bids'

/** Действие над заявкой, которому нужна причина (обязательна по контракту). */
type PendingAction = { bidId: string; kind: BidDecision | 'withdraw' }

const ACTION_TITLES: Record<PendingAction['kind'], string> = {
  admit: 'Допуск заявки к торгам',
  reject: 'Отклонение заявки',
  withdraw: 'Отзыв своей заявки',
}

/**
 * Заявки тендера (FR-1.2, GET /tenders/{id}/bids).
 *
 * Одна секция для обеих сторон процедуры — роль определяется сравнением
 * `tender.customer_id` с компанией пользователя:
 * - заказчик видит все заявки и рассматривает их (POST /bids/{id}/qualification):
 *   допуск/отклонение с обязательной причиной;
 * - участник подаёт свою заявку (POST /tenders/{id}/bids) и может отозвать её
 *   до окончания приёма (POST /bids/{id}/withdraw).
 *
 * Зачем это в карточке тендера: ставки на аукционе принимаются ТОЛЬКО от
 * компании с заявкой в статусе «Допущена» на этот лот (FR-1.3.2). Без допуска
 * любая ставка отбивается 409 bid_rejected.
 *
 * До вскрытия заявок бэкенд отдаёт только метаданные (FR-1.2.2): цена и
 * содержимое зашифрованы, поэтому колонка цены до вскрытия пуста — это не
 * ошибка загрузки.
 */
export function TenderBids({ tender }: { tender: Tender }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const tenderId = tender.id ?? ''
  const companyId = user?.company_id ?? null
  // Заказчик = тенант тендера. У сотрудника без компании роли в процедуре нет.
  const isCustomer = isTenderCustomer(tender, user)
  // agent — только просмотр: bids.submit/withdraw/qualify ему не выданы (403).
  const canAct = user?.role != null && user.role !== 'agent'
  const accepting = tender.status === ACCEPTING

  const [submitOpen, setSubmitOpen] = useState(false)
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [reason, setReason] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [isActing, setIsActing] = useState(false)

  const firstPageQuery = useQuery({
    queryKey: ['bids', tenderId, null],
    queryFn: () => listBids(tenderId),
    enabled: tenderId !== '',
  })

  const { items, isFetchingMore, hasMore, loadMore, reset } = useCursorPage<Bid>()

  // Аккумулятор наполняется первой страницей и пересобирается заново, когда она
  // меняется: смена тендера или инвалидация кэша после мутации заявки. Доклад
  // следующих страниц («Показать ещё») дописывается поверх.
  useEffect(() => {
    if (!firstPageQuery.isSuccess) return
    const data = firstPageQuery.data
    reset()
    void loadMore(() =>
      Promise.resolve<CursorPageData<Bid>>({
        items: data.items,
        next_cursor: data.next_cursor,
      }),
    )
  }, [firstPageQuery.isSuccess, firstPageQuery.data, loadMore, reset])

  function fetchNextPage(cursor: string | null): Promise<CursorPageData<Bid>> {
    return queryClient.fetchQuery({
      queryKey: ['bids', tenderId, cursor],
      queryFn: () => listBids(tenderId, cursor),
    })
  }

  /** Подписи лотов для колонки «Лот»: заявка ссылается на лот только id. */
  const lotLabels = useMemo(() => {
    const map = new Map<string, string>()
    for (const lot of tender.lots ?? []) {
      if (lot.id != null) map.set(lot.id, `№${lot.number ?? '—'} · ${lot.title || 'без названия'}`)
    }
    return map
  }, [tender.lots])

  /** Своя заявка на этот лот уже подана — повторная подача её заменит. */
  const ownBids = items.filter((bid) => bid.supplier_id === companyId)
  const hasAdmitted = items.some((bid) => isBidAdmitted(bid.status))
  const ownAdmitted = ownBids.some((bid) => isBidAdmitted(bid.status))

  function openAction(bidId: string, kind: PendingAction['kind']): void {
    setSubmitOpen(false)
    setReason('')
    setActionError(null)
    setPending({ bidId, kind })
  }

  async function confirmAction(): Promise<void> {
    if (pending == null) return
    const text = reason.trim()
    if (text === '') {
      setActionError('Причина обязательна.')
      return
    }
    setActionError(null)
    setIsActing(true)
    try {
      if (pending.kind === 'withdraw') {
        await withdrawBid({
          bidId: pending.bidId,
          reason: text,
          idempotencyKey: crypto.randomUUID(),
        })
      } else {
        await qualifyBid(pending.bidId, pending.kind, text)
      }
      setPending(null)
      setReason('')
      await queryClient.invalidateQueries({ queryKey: ['bids', tenderId] })
    } catch (err) {
      setActionError(apiErrorMessage(err))
    } finally {
      setIsActing(false)
    }
  }

  if (tenderId === '') return null

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base">Заявки</CardTitle>
            <p className="text-muted-foreground text-sm">
              {isCustomer
                ? 'Рассмотрение заявок участников. Допущенная заявка открывает компании доступ к ставкам на аукционе по этому лоту.'
                : 'Заявка на участие. Ставки на аукционе принимаются только после допуска заявки заказчиком.'}
            </p>
          </div>
          {!isCustomer && canAct && (
            <Button
              size="sm"
              disabled={!accepting || (tender.lots ?? []).length === 0}
              title={
                accepting
                  ? 'Подать заявку на лот'
                  : 'Заявки принимаются только в статусе «Приём заявок»'
              }
              onClick={() => {
                setPending(null)
                setSubmitOpen((open) => !open)
              }}
            >
              <FilePlus2 className="size-4" />
              {ownBids.length > 0 ? 'Заменить заявку' : 'Подать заявку'}
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {firstPageQuery.isError && (
            <p className="text-destructive px-6 pb-3 text-sm">
              Не удалось загрузить заявки: {apiErrorMessage(firstPageQuery.error)}
            </p>
          )}

          {isCustomer && items.length > 0 && !hasAdmitted && (
            <p className="text-muted-foreground px-6 pb-3 text-sm">
              Допущенных участников пока нет — аукцион отобьёт любую ставку. Допустите
              заявку, чтобы участник смог торговаться.
            </p>
          )}
          {!isCustomer && ownBids.length > 0 && !ownAdmitted && (
            <p className="text-muted-foreground px-6 pb-3 text-sm">
              Заявка ещё не допущена заказчиком — до этого ставки на аукционе не
              принимаются.
            </p>
          )}

          {firstPageQuery.isLoading ? (
            <p className="text-muted-foreground px-6 py-4 text-sm">Загружаем заявки…</p>
          ) : items.length === 0 ? (
            <p className="text-muted-foreground px-6 py-4 text-sm">
              {isCustomer ? 'Заявок пока нет.' : 'Вы ещё не подавали заявку на этот тендер.'}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Лот</TableHead>
                  <TableHead>Участник</TableHead>
                  <TableHead className="text-right">Цена предложения</TableHead>
                  <TableHead>Подана</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead className="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((bid) => {
                  const own = bid.supplier_id === companyId
                  const canQualify = isCustomer && canAct && isBidQualifiable(bid.status)
                  const canWithdraw =
                    own && canAct && accepting && bid.status === 'submitted'
                  return (
                    <TableRow key={bid.id}>
                      <TableCell className="font-medium">
                        {bid.lot_id != null
                          ? (lotLabels.get(bid.lot_id) ?? 'лот вне карточки')
                          : 'Тендер целиком'}
                      </TableCell>
                      <TableCell>
                        {own ? (
                          'Ваша компания'
                        ) : (
                          <span className="text-muted-foreground font-mono text-xs">
                            {bid.supplier_id ?? '—'}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {bid.price_minor != null ? (
                          formatMoney(bid.price_minor, tender.currency)
                        ) : (
                          <span
                            className="text-muted-foreground text-xs"
                            title={
                              bid.payload_encrypted === true
                                ? 'Содержимое заявки зашифровано до вскрытия'
                                : undefined
                            }
                          >
                            {bid.payload_encrypted === true ? 'до вскрытия' : '—'}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {bid.submitted_at != null ? formatDateTime(bid.submitted_at) : '—'}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <BidStatusBadge status={bid.status} />
                          {bid.decision_reason != null && bid.decision_reason !== '' && (
                            <p className="text-muted-foreground max-w-60 text-xs">
                              {bid.decision_reason}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {canQualify && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openAction(bid.id ?? '', 'admit')}
                              >
                                <CheckCircle2 className="size-4" />
                                Допустить
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openAction(bid.id ?? '', 'reject')}
                              >
                                <XCircle className="size-4" />
                                Отклонить
                              </Button>
                            </>
                          )}
                          {canWithdraw && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => openAction(bid.id ?? '', 'withdraw')}
                            >
                              <Undo2 className="size-4" />
                              Отозвать
                            </Button>
                          )}
                          {!canQualify && !canWithdraw && (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}

          {hasMore && (
            <div className="flex justify-center p-4">
              <Button
                variant="outline"
                size="sm"
                disabled={isFetchingMore}
                onClick={() => void loadMore(fetchNextPage)}
              >
                {isFetchingMore ? 'Загружаем…' : 'Показать ещё'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {pending != null && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{ACTION_TITLES[pending.kind]}</CardTitle>
            <p className="text-muted-foreground text-sm">
              Причина обязательна: она сохраняется в решении по заявке и в аудите
              {pending.kind === 'reject' && ', а участник получает уведомление'}.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="bid-action-reason" className="text-sm font-medium">
                Причина
              </label>
              <Input
                id="bid-action-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={
                  pending.kind === 'admit'
                    ? 'Заявка соответствует требованиям закупки'
                    : 'Укажите причину'
                }
              />
            </div>
            {actionError != null && <p className="text-destructive text-sm">{actionError}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setPending(null)}>
                Отмена
              </Button>
              <Button
                type="button"
                variant={pending.kind === 'admit' ? 'default' : 'destructive'}
                disabled={isActing}
                onClick={() => void confirmAction()}
              >
                {isActing ? 'Отправляем…' : 'Подтвердить'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {submitOpen && companyId != null && (
        <BidSubmitForm
          tender={tender}
          supplierId={companyId}
          defaultLotId={ownBids[0]?.lot_id ?? undefined}
          onCancel={() => setSubmitOpen(false)}
          onSubmitted={() => setSubmitOpen(false)}
        />
      )}
    </div>
  )
}

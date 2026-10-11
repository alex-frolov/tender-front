import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { FileSignature } from 'lucide-react'
import { listContracts } from '@/api/endpoints'
import { queryKeys } from '@/api/queryKeys'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ContractClaims } from '@/features/contracts/ContractClaims'
import {
  CONTRACT_STATUS_BADGE_VARIANTS,
  CONTRACT_STATUS_LABELS,
  type ContractStatus,
} from '@/lib/contracts'
import { apiErrorMessage } from '@/lib/errors'
import { formatDate } from '@/lib/format'
import { formatMoney } from '@/lib/money'
import type { AuctionStatus } from './auctionStatus'

/** Стадии исполнения, где договор уже нужен по смыслу (выбор победителя и дальше). */
const EXECUTION_STATUSES: readonly AuctionStatus[] = [
  'approve',
  'in_work',
  'done_by_performer',
  'claim',
  'done',
  'done_by_claim',
]

/**
 * Договор по процедуре аукциона и претензии по нему.
 *
 * Зачем на странице аукциона: договор — отдельная сущность в разделе
 * «Договоры», и со страницы аукциона его не видно вовсе. Из-за этого статус
 * «Утверждение» выглядел так, будто договор не нужен: кнопка «Начать работы»
 * активна и без него (её проверяет только `ExecutionVoter`), а отказ приходит
 * позже — на подтверждении выполнения, кодом `contract_required`.
 *
 * Договор ищется привязкой к процедуре (`GET /contracts?tender_id=`): фильтр
 * добавлен в API вместе с этим блоком, до него ответить «есть ли договор по
 * этому тендеру» можно было только вычиткой всего реестра компании.
 *
 * Претензия (FR-1.4.5) живёт здесь же и по той же причине: выставляет её
 * заказчик по стадии исполнения (approve / in_work / done_by_performer), то
 * есть ровно тогда, когда он смотрит на аукцион, а не на карточку договора.
 */
export function AuctionContract({
  tenderId,
  status,
  canControl,
}: {
  tenderId: string | undefined
  status: AuctionStatus | undefined
  canControl: boolean
}) {
  const active = status != null && EXECUTION_STATUSES.includes(status)

  const contractsQuery = useQuery({
    queryKey: queryKeys.contracts.byTender(tenderId),
    queryFn: () => listContracts({ tender_id: tenderId ?? '' }),
    enabled: active && tenderId != null,
  })

  if (!active || tenderId == null) return null

  // Привязок к одной процедуре может быть несколько (многоразовый договор
  // привязывают заново) — берём последнюю: реестр отдаёт новые сверху.
  const contract = contractsQuery.data?.items?.[0]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileSignature className="size-4" />
          Договор
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {contractsQuery.isLoading ? (
          <p className="text-muted-foreground text-sm">Загружаем договор…</p>
        ) : contractsQuery.isError ? (
          <p className="text-destructive text-sm">
            Не удалось загрузить договор: {apiErrorMessage(contractsQuery.error)}
          </p>
        ) : contract == null ? (
          <>
            <p className="text-muted-foreground text-sm">
              {canControl
                ? 'Договора по этой процедуре ещё нет. Заводит его заказчик в разделе «Договоры»: создать → отправить на подпись → подписать обеими сторонами → привязать процедуру.'
                : 'Договор по этой процедуре ещё не заключён. Его заводит заказчик — создаёт в разделе «Договоры», отправляет на подпись и привязывает процедуру; вам останется подписать со своей стороны.'}
            </p>
            <p className="text-muted-foreground text-sm">
              На работы это пока не влияет: «Начать работы» доступно и без договора. А вот
              закрыть лот без него нельзя — подтверждение выполнения вернёт отказ
              «нужен действующий договор».
            </p>
            <Button asChild variant="outline" size="sm">
              <Link to="/contracts">К договорам</Link>
            </Button>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <span className="font-medium">{contract.number ?? 'без номера'}</span>
              {contract.status != null && (
                <Badge
                  variant={
                    CONTRACT_STATUS_BADGE_VARIANTS[contract.status as ContractStatus] ?? 'neutral'
                  }
                >
                  {CONTRACT_STATUS_LABELS[contract.status as ContractStatus] ?? contract.status}
                </Badge>
              )}
              {contract.price_net_minor != null && (
                <span className="tabular-nums">{formatMoney(contract.price_net_minor)}</span>
              )}
              {contract.valid_to != null && (
                <span className="text-muted-foreground text-xs">
                  действует до {formatDate(contract.valid_to)}
                </span>
              )}
              <Button asChild variant="outline" size="sm" className="ml-auto">
                <Link to={`/contracts?contract=${contract.id ?? ''}`}>Открыть договор</Link>
              </Button>
            </div>

            {contract.status !== 'signed' && contract.status !== 'registered' && (
              <p className="text-muted-foreground text-sm">
                Договор ещё не действует: подтверждение выполнения принимается только по
                подписанному или зарегистрированному договору.
              </p>
            )}

            <div className="border-t pt-3">
              <ContractClaims contractId={contract.id ?? ''} canManage={canControl} />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getContract,
  listContracts,
  sendContractForSignature,
  signContract,
  type Contract,
  type ContractsQuery,
} from '@/api/endpoints'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { useAuth } from '@/features/auth/AuthContext'
import { useCompanyQuery } from '@/features/company/useCompany'
import { ContractClaims } from './ContractClaims'
import { ContractSecurities } from './ContractSecurities'
import { useCursorPage, type CursorPageData } from '@/hooks/useCursorPage'
import {
  CONTRACT_SCOPE_LABELS,
  CONTRACT_SOURCE_LABELS,
  CONTRACT_STATUS_BADGE_VARIANTS,
  CONTRACT_STATUS_LABELS,
  CONTRACT_STATUSES,
  CONTRACT_TENDER_STATUS_BADGE_VARIANTS,
  CONTRACT_TENDER_STATUS_LABELS,
  type ContractStatus,
} from '@/lib/contracts'
import { apiErrorMessage } from '@/lib/errors'
import { formatDate, formatDateTime } from '@/lib/format'
import { formatMoney } from '@/lib/money'

/** Специальное значение «все» для Select — Radix не принимает пустую строку. */
const ALL_VALUE = 'all'

function isContractStatus(value: string): value is ContractStatus {
  return (CONTRACT_STATUSES as readonly string[]).includes(value)
}

/** Короткий вид UUID для таблицы (полный — в title). */
function ShortId({ value }: { value: string | null | undefined }) {
  if (value == null || value === '') {
    return <span className="text-muted-foreground">—</span>
  }
  return (
    <span className="font-mono text-muted-foreground text-xs" title={value}>
      {value.slice(0, 8)}…
    </span>
  )
}

/** Бейдж статуса контракта (подписи и палитра — lib/contracts.ts). */
function ContractStatusBadge({ status }: { status: ContractStatus | undefined }) {
  if (status == null) {
    return <Badge variant="neutral">—</Badge>
  }
  return (
    <Badge variant={CONTRACT_STATUS_BADGE_VARIANTS[status] ?? 'neutral'}>
      {CONTRACT_STATUS_LABELS[status] ?? status}
    </Badge>
  )
}

/** Строка «подпись: значение» в карточке контракта. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="text-sm">{children}</div>
    </div>
  )
}

/**
 * Карточка контракта (GET /contracts/{id}) + действия жизненного цикла:
 * draft → «Отправить на подпись», pending_signature → «Подписать».
 * Сторона подписи (customer/supplier) определяется по компании актора; если
 * компания одновременно и заказчик, и поставщик — сторона выбирается вручную.
 */
function ContractCard({ contractId, onClose }: { contractId: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const companyQuery = useCompanyQuery()
  const [actionError, setActionError] = useState<string | null>(null)

  const contractQuery = useQuery({
    queryKey: ['contract', contractId],
    queryFn: () => getContract(contractId),
  })

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['contract', contractId] })
    void queryClient.invalidateQueries({ queryKey: ['contracts'] })
  }

  const sendMutation = useMutation({
    mutationFn: () => sendContractForSignature(contractId),
    onSuccess: invalidate,
  })

  const signMutation = useMutation({
    mutationFn: (party: 'customer' | 'supplier') => signContract(contractId, party),
    onSuccess: invalidate,
  })

  const contract = contractQuery.data
  const companyId = companyQuery.data?.id

  const isCustomer = contract?.customer_id != null && contract.customer_id === companyId
  const isSupplier = contract?.supplier_id != null && contract.supplier_id === companyId
  const [party, setParty] = useState<'customer' | 'supplier'>('customer')

  useEffect(() => {
    if (isSupplier && !isCustomer) setParty('supplier')
    if (isCustomer && !isSupplier) setParty('customer')
  }, [isCustomer, isSupplier])

  async function runAction(action: Promise<unknown>): Promise<void> {
    setActionError(null)
    try {
      await action
    } catch (err) {
      setActionError(apiErrorMessage(err))
    }
  }

  if (contractQuery.isLoading) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-muted-foreground text-sm">Загружаем контракт…</p>
        </CardContent>
      </Card>
    )
  }

  if (contractQuery.isError || contract == null) {
    return (
      <Card>
        <CardContent className="space-y-3 py-6">
          <p className="text-destructive text-sm">
            Не удалось загрузить контракт: {apiErrorMessage(contractQuery.error)}
          </p>
          <Button variant="outline" size="sm" onClick={onClose}>
            Закрыть
          </Button>
        </CardContent>
      </Card>
    )
  }

  // Управление контрактом — admin/manager (agent только смотрит).
  const canAct = user?.role !== 'agent' && user?.role != null
  const canSend = canAct && contract.status === 'draft'
  const canSign = canAct && contract.status === 'pending_signature' && (isCustomer || isSupplier)
  const tenders = contract.tenders ?? []

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle className="text-base">
            Контракт {contract.number || '—'}
          </CardTitle>
          <div className="flex items-center gap-2">
            <ContractStatusBadge status={contract.status} />
            {contract.scope != null && (
              <span className="text-muted-foreground text-xs">
                {CONTRACT_SCOPE_LABELS[contract.scope] ?? contract.scope}
              </span>
            )}
            {contract.source != null && (
              <span className="text-muted-foreground text-xs">
                · {CONTRACT_SOURCE_LABELS[contract.source] ?? contract.source}
              </span>
            )}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Закрыть
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Заказчик">
            <ShortId value={contract.customer_id} />
            {isCustomer && <Badge variant="info" className="ml-2">моя компания</Badge>}
          </Field>
          <Field label="Поставщик">
            <ShortId value={contract.supplier_id} />
            {isSupplier && <Badge variant="info" className="ml-2">моя компания</Badge>}
          </Field>
          <Field label="Сумма без НДС">
            <span className="tabular-nums">
              {contract.price_net_minor != null ? formatMoney(contract.price_net_minor) : '—'}
            </span>
          </Field>
          <Field label="Сумма с НДС">
            <span className="tabular-nums">
              {contract.price_gross_minor != null ? formatMoney(contract.price_gross_minor) : '—'}
            </span>
          </Field>
          <Field label="Действует с">
            {contract.valid_from != null ? formatDate(contract.valid_from) : '—'}
          </Field>
          <Field label="Действует по">
            {contract.valid_to != null ? formatDate(contract.valid_to) : '—'}
          </Field>
          <Field label="Подписан">
            {contract.signed_at != null ? formatDateTime(contract.signed_at) : '—'}
          </Field>
          <Field label="Зарегистрирован">
            {contract.registered_at != null ? formatDateTime(contract.registered_at) : '—'}
          </Field>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-medium">Привязанные тендеры</h3>
          {tenders.length === 0 ? (
            <p className="text-muted-foreground text-sm">Тендеры не привязаны.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Тендер</TableHead>
                  <TableHead>Лот</TableHead>
                  <TableHead className="text-right">Сумма без НДС</TableHead>
                  <TableHead>Статус исполнения</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenders.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <ShortId value={item.tender_id} />
                    </TableCell>
                    <TableCell>
                      <ShortId value={item.lot_id} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {item.price_net_minor != null ? formatMoney(item.price_net_minor) : '—'}
                    </TableCell>
                    <TableCell>
                      {item.status != null ? (
                        <Badge
                          variant={CONTRACT_TENDER_STATUS_BADGE_VARIANTS[item.status] ?? 'neutral'}
                        >
                          {CONTRACT_TENDER_STATUS_LABELS[item.status] ?? item.status}
                        </Badge>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <div className="border-t pt-4">
          <ContractClaims contractId={contractId} canManage={isCustomer} />
        </div>

        <div className="border-t pt-4">
          <ContractSecurities canForfeit={isCustomer} />
        </div>

        {actionError != null && <p className="text-destructive text-sm">{actionError}</p>}

        {(canSend || canSign) && (
          <div className="flex flex-wrap items-end gap-2 border-t pt-4">
            {canSend && (
              <Button
                size="sm"
                disabled={sendMutation.isPending}
                onClick={() => void runAction(sendMutation.mutateAsync())}
              >
                {sendMutation.isPending ? 'Отправляем…' : 'Отправить на подпись'}
              </Button>
            )}
            {canSign && (
              <>
                {isCustomer && isSupplier && (
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Сторона</label>
                    <Select
                      value={party}
                      onValueChange={(value) => setParty(value as 'customer' | 'supplier')}
                    >
                      <SelectTrigger className="w-44">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="customer">Заказчик</SelectItem>
                        <SelectItem value="supplier">Поставщик</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <Button
                  size="sm"
                  disabled={signMutation.isPending}
                  onClick={() => void runAction(signMutation.mutateAsync(party))}
                >
                  {signMutation.isPending ? 'Подписываем…' : 'Подписать'}
                </Button>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Список контрактов (GET /contracts): фильтр по статусу в URL, курсорная
 * пагинация «Показать ещё» (паттерн TendersPage), карточка выбранного
 * контракта — под таблицей.
 */
export function ContractsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const statusFilter = searchParams.get('contract_status') ?? ''
  const apiQuery = useMemo<ContractsQuery>(
    () => (isContractStatus(statusFilter) ? { contract_status: statusFilter } : {}),
    [statusFilter],
  )

  const firstPageQuery = useQuery({
    queryKey: ['contracts', statusFilter, null],
    queryFn: () => listContracts(apiQuery),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })

  const { items, isFetchingMore, hasMore, loadMore, reset } = useCursorPage<Contract>()
  const primedFilterKey = useRef<string | null>(null)

  // Аккумулятор наполняется первой страницей; сброс — только при смене фильтра.
  useEffect(() => {
    if (!firstPageQuery.isSuccess || firstPageQuery.isPlaceholderData) return
    if (primedFilterKey.current === statusFilter) return
    primedFilterKey.current = statusFilter
    reset()
    const data = firstPageQuery.data
    void loadMore(() =>
      Promise.resolve<CursorPageData<Contract>>({
        items: data.items ?? [],
        next_cursor: data.next_cursor,
      }),
    )
  }, [
    firstPageQuery.isSuccess,
    firstPageQuery.isPlaceholderData,
    firstPageQuery.data,
    statusFilter,
    loadMore,
    reset,
  ])

  function fetchNextPage(cursor: string | null): Promise<CursorPageData<Contract>> {
    return queryClient.fetchQuery({
      queryKey: ['contracts', statusFilter, cursor],
      queryFn: () => listContracts(cursor == null ? apiQuery : { ...apiQuery, cursor }),
    })
  }

  function handleStatusChange(value: string): void {
    const params = new URLSearchParams()
    if (value !== ALL_VALUE) params.set('contract_status', value)
    setSelectedId(null)
    setSearchParams(params)
  }

  const isEmpty = firstPageQuery.isSuccess && items.length === 0

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Контракты</h1>
        <p className="text-muted-foreground text-sm">
          Договоры компании: статусы, суммы, подписание.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Статус</label>
          <Select
            value={statusFilter === '' ? ALL_VALUE : statusFilter}
            onValueChange={handleStatusChange}
          >
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Все статусы" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>Все статусы</SelectItem>
              {CONTRACT_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {CONTRACT_STATUS_LABELS[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {firstPageQuery.isError ? (
        <Card>
          <CardContent className="space-y-4">
            <p className="text-destructive text-sm">
              Не удалось загрузить контракты: {apiErrorMessage(firstPageQuery.error)}
            </p>
            <Button variant="outline" onClick={() => void firstPageQuery.refetch()}>
              Повторить
            </Button>
          </CardContent>
        </Card>
      ) : firstPageQuery.isLoading ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-muted-foreground text-sm">Загружаем контракты…</p>
          </CardContent>
        </Card>
      ) : isEmpty ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-muted-foreground text-sm">Контрактов нет</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Номер</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead>Заказчик</TableHead>
                    <TableHead>Поставщик</TableHead>
                    <TableHead className="text-right">Сумма с НДС</TableHead>
                    <TableHead>Срок действия</TableHead>
                    <TableHead className="text-right">Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((contract) => (
                    <TableRow key={contract.id}>
                      <TableCell className="font-medium">{contract.number || '—'}</TableCell>
                      <TableCell>
                        <ContractStatusBadge status={contract.status} />
                      </TableCell>
                      <TableCell>
                        <ShortId value={contract.customer_id} />
                      </TableCell>
                      <TableCell>
                        <ShortId value={contract.supplier_id} />
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {contract.price_gross_minor != null
                          ? formatMoney(contract.price_gross_minor)
                          : '—'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {contract.valid_from != null ? formatDate(contract.valid_from) : '—'}
                        {' — '}
                        {contract.valid_to != null ? formatDate(contract.valid_to) : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedId(contract.id ?? null)}
                        >
                          Открыть
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {hasMore && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                disabled={isFetchingMore || firstPageQuery.isFetching}
                onClick={() => void loadMore(fetchNextPage)}
              >
                {isFetchingMore ? 'Загружаем…' : 'Показать ещё'}
              </Button>
            </div>
          )}
        </>
      )}

      {selectedId != null && (
        <ContractCard contractId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  )
}

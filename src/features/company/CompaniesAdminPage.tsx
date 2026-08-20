import { useEffect, useMemo, useRef, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  listCompanies,
  verifyCompany,
  type CompaniesQuery,
  type Company,
} from '@/api/endpoints'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
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
import { useCursorPage, type CursorPageData } from '@/hooks/useCursorPage'
import {
  COMPANY_STATUS_BADGE_VARIANTS,
  COMPANY_STATUS_LABELS,
  COMPANY_TYPE_LABELS,
  type CompanyStatus,
} from '@/lib/company'
import { apiErrorMessage } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'

/** Специальное значение «все» для Select — Radix не принимает пустую строку. */
const ALL_VALUE = 'all'

const COMPANY_STATUSES = ['pending', 'active', 'rejected', 'suspended'] as const

function isCompanyStatus(value: string): value is CompanyStatus {
  return (COMPANY_STATUSES as readonly string[]).includes(value)
}

/**
 * Доступные переходы модерации для текущего статуса — те же, что в workflow
 * company_verification на бэке: approve/reject из pending и suspended,
 * suspend из active. Недопустимый переход API вернёт 409, поэтому кнопок
 * для него не показываем.
 */
function allowedActions(status: CompanyStatus | undefined): ('approve' | 'reject' | 'suspend')[] {
  switch (status) {
    case 'pending':
      return ['approve', 'reject']
    case 'suspended':
      return ['approve', 'reject']
    case 'active':
      return ['suspend']
    default:
      return []
  }
}

const ACTION_LABELS: Record<'approve' | 'reject' | 'suspend', string> = {
  approve: 'Подтвердить',
  reject: 'Отклонить',
  suspend: 'Приостановить',
}

/** Бейдж статуса верификации компании (подписи и палитра — lib/company.ts). */
function CompanyStatusBadge({ status }: { status: CompanyStatus | undefined }) {
  if (status == null) {
    return <Badge variant="neutral">—</Badge>
  }
  return (
    <Badge variant={COMPANY_STATUS_BADGE_VARIANTS[status] ?? 'neutral'}>
      {COMPANY_STATUS_LABELS[status] ?? status}
    </Badge>
  )
}

/**
 * Реестр компаний площадки (/admin/companies) — рабочий экран суперадмина:
 * очередь на верификацию и действия approve/reject/suspend
 * (POST /companies/{id}/verify).
 *
 * Раздел виден только роли platform_admin: у остальных ролей API отдаёт 403,
 * а карточка своей компании живёт отдельно — «Моя компания» (/my-company).
 * Причина обязательна для «Отклонить» (иначе бэкенд вернёт 422), поэтому
 * поле ввода раскрывается прямо в строке.
 */
export function CompaniesAdminPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [statusFilter, setStatusFilter] = useState<string>(ALL_VALUE)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  /** id компании, для которой открыт ввод причины отклонения. */
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)

  const isPlatformAdmin = user?.role === 'platform_admin'

  const apiQuery = useMemo<CompaniesQuery>(() => {
    const query: CompaniesQuery = {}
    if (isCompanyStatus(statusFilter)) query.status = statusFilter
    if (search !== '') query.q = search
    return query
  }, [statusFilter, search])

  // Ключ фильтров: смена значения сбрасывает накопленный список страниц.
  const filtersKey = `${statusFilter}|${search}`

  const firstPageQuery = useQuery({
    queryKey: ['companies', filtersKey, null],
    queryFn: () => listCompanies(apiQuery),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    enabled: isPlatformAdmin,
  })

  const { items, isFetchingMore, hasMore, loadMore, reset } = useCursorPage<Company>()
  const primedFiltersKey = useRef<string | null>(null)

  useEffect(() => {
    if (!firstPageQuery.isSuccess || firstPageQuery.isPlaceholderData) return
    if (primedFiltersKey.current === filtersKey) return
    primedFiltersKey.current = filtersKey
    reset()
    const data = firstPageQuery.data
    void loadMore(() =>
      Promise.resolve<CursorPageData<Company>>({
        items: data.items ?? [],
        next_cursor: data.next_cursor,
      }),
    )
  }, [
    firstPageQuery.isSuccess,
    firstPageQuery.isPlaceholderData,
    firstPageQuery.data,
    filtersKey,
    loadMore,
    reset,
  ])

  function fetchNextPage(cursor: string | null): Promise<CursorPageData<Company>> {
    return queryClient.fetchQuery({
      queryKey: ['companies', filtersKey, cursor],
      queryFn: () => listCompanies(cursor == null ? apiQuery : { ...apiQuery, cursor }),
    })
  }

  const verifyMutation = useMutation({
    mutationFn: (input: {
      companyId: string
      action: 'approve' | 'reject' | 'suspend'
      reason?: string
    }) => verifyCompany(input.companyId, input.action, input.reason),
    onSuccess: () => {
      // Статус строки меняется на бэке — перечитываем страницу с нуля.
      primedFiltersKey.current = null
      void queryClient.invalidateQueries({ queryKey: ['companies'] })
      // Своя компания могла быть подтверждена/приостановлена — карточка тоже.
      void queryClient.invalidateQueries({ queryKey: ['company'] })
    },
  })

  async function runAction(
    companyId: string,
    action: 'approve' | 'reject' | 'suspend',
    withReason?: string,
  ): Promise<void> {
    setActionError(null)
    try {
      await verifyMutation.mutateAsync({ companyId, action, reason: withReason })
      setRejectingId(null)
      setReason('')
    } catch (err) {
      setActionError(apiErrorMessage(err))
    }
  }

  function applySearch(): void {
    setSearch(searchInput.trim())
  }

  if (!isPlatformAdmin) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <p className="text-muted-foreground text-sm">
            Раздел доступен только суперадминистратору платформы.
          </p>
        </CardContent>
      </Card>
    )
  }

  const isEmpty = firstPageQuery.isSuccess && items.length === 0

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Компании</h1>
        <p className="text-muted-foreground text-sm">
          Реестр компаний площадки: заявки на верификацию, подтверждение,
          отклонение и приостановка.
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
              {COMPANY_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {COMPANY_STATUS_LABELS[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="company-search">
            Поиск
          </label>
          <Input
            id="company-search"
            className="w-64"
            placeholder="Название или ИНН"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') applySearch()
            }}
          />
        </div>

        <Button variant="outline" onClick={applySearch}>
          Найти
        </Button>
      </div>

      {actionError != null && <p className="text-destructive text-sm">{actionError}</p>}

      {firstPageQuery.isError ? (
        <Card>
          <CardContent className="space-y-4">
            <p className="text-destructive text-sm">
              Не удалось загрузить компании: {apiErrorMessage(firstPageQuery.error)}
            </p>
            <Button variant="outline" onClick={() => void firstPageQuery.refetch()}>
              Повторить
            </Button>
          </CardContent>
        </Card>
      ) : firstPageQuery.isLoading ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-muted-foreground text-sm">Загружаем компании…</p>
          </CardContent>
        </Card>
      ) : isEmpty ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-muted-foreground text-sm">Компаний нет</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Компания</TableHead>
                    <TableHead>Тип</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead>Зарегистрирована</TableHead>
                    <TableHead>Подтверждена</TableHead>
                    <TableHead className="text-right">Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((company) => {
                    const actions = allowedActions(company.verification_status)
                    const isRejecting = rejectingId === company.id
                    return (
                      <TableRow key={company.id}>
                        <TableCell>
                          <div className="font-medium">{company.legal_name || '—'}</div>
                          <div className="text-muted-foreground text-xs" title={company.id}>
                            ИНН {company.inn || '—'}
                            {company.kpp != null && company.kpp !== '' && ` · КПП ${company.kpp}`}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {company.type != null
                            ? COMPANY_TYPE_LABELS[company.type] ?? company.type
                            : '—'}
                        </TableCell>
                        <TableCell>
                          <CompanyStatusBadge status={company.verification_status} />
                        </TableCell>
                        <TableCell className="text-sm">
                          {company.created_at != null ? formatDateTime(company.created_at) : '—'}
                        </TableCell>
                        <TableCell className="text-sm">
                          {company.verified_at != null ? formatDateTime(company.verified_at) : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          {actions.length === 0 ? (
                            <span className="text-muted-foreground text-sm">—</span>
                          ) : isRejecting ? (
                            // Причина обязательна для reject (иначе 422).
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              <Input
                                className="w-56"
                                placeholder="Причина отклонения"
                                value={reason}
                                onChange={(event) => setReason(event.target.value)}
                                autoFocus
                              />
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={reason.trim() === '' || verifyMutation.isPending}
                                onClick={() =>
                                  void runAction(company.id ?? '', 'reject', reason.trim())
                                }
                              >
                                Отклонить
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setRejectingId(null)
                                  setReason('')
                                }}
                              >
                                Отмена
                              </Button>
                            </div>
                          ) : (
                            <div className="flex flex-wrap justify-end gap-2">
                              {actions.map((action) => (
                                <Button
                                  key={action}
                                  size="sm"
                                  variant={action === 'approve' ? 'default' : 'outline'}
                                  disabled={verifyMutation.isPending}
                                  onClick={() => {
                                    setActionError(null)
                                    if (action === 'reject') {
                                      setRejectingId(company.id ?? null)
                                      setReason('')
                                      return
                                    }
                                    void runAction(company.id ?? '', action)
                                  }}
                                >
                                  {ACTION_LABELS[action]}
                                </Button>
                              ))}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
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
    </div>
  )
}

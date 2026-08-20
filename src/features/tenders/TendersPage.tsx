import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { listTenders, type TendersQuery } from '@/api/endpoints'
import type { components } from '@/api/schema'
import { TenderStatusBadge } from '@/components/tender/TenderStatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/features/auth/AuthContext'
import { CompanyGateBanner } from '@/features/company/CompanyGateBanner'
import { companyGateHint, useCompanyGate } from '@/features/company/useCompanyGate'
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
import { ExportButton } from '@/features/dashboard/ExportButton'
import { useCursorPage, type CursorPageData } from '@/hooks/useCursorPage'
import { apiErrorMessage } from '@/lib/errors'
import {
  ACCESS_TYPE_LABELS,
  ACCESS_TYPES,
  LAW_TYPE_LABELS,
  LAW_TYPES,
  TENDER_STATUS_LABELS,
  TENDER_STATUSES,
  type AccessType,
  type LawType,
  type TenderStatus,
} from '@/lib/enums'
import { formatDateTime, formatRemaining, plural } from '@/lib/format'
import { formatMoney } from '@/lib/money'

type TenderListItem = components['schemas']['TenderListItem']

/** Специальное значение «все» для Select — Radix не принимает пустую строку. */
const ALL_VALUE = 'all'

/**
 * Фильтры каталога — живут в URL (query-параметры спеки). Значения строковые:
 * числовые фильтры цены хранятся в рублях, в minor units переводятся при запросе.
 */
interface TenderFilters {
  q: string
  status: string
  law_type: string
  region: string
  price_min: string
  price_max: string
  access_type: string
}

const EMPTY_FILTERS: TenderFilters = {
  q: '',
  status: '',
  law_type: '',
  region: '',
  price_min: '',
  price_max: '',
  access_type: '',
}

/** Чтение фильтров из query-параметров (единый источник для запроса и UI). */
function readFilters(params: URLSearchParams): TenderFilters {
  return {
    q: params.get('q') ?? '',
    status: params.get('status') ?? '',
    law_type: params.get('law_type') ?? '',
    region: params.get('region') ?? '',
    price_min: params.get('price_min') ?? '',
    price_max: params.get('price_max') ?? '',
    access_type: params.get('access_type') ?? '',
  }
}

function isTenderStatus(value: string): value is TenderStatus {
  return (TENDER_STATUSES as readonly string[]).includes(value)
}

function isLawType(value: string): value is LawType {
  return (LAW_TYPES as readonly string[]).includes(value)
}

function isAccessType(value: string): value is AccessType {
  return (ACCESS_TYPES as readonly string[]).includes(value)
}

/**
 * Преобразование фильтров в параметры API. НМЦК из рублей переводится в minor
 * units (API ожидает целые копейки — конвенция formatMoney).
 */
function filtersToQuery(filters: TenderFilters): TendersQuery {
  const query: TendersQuery = {}
  const q = filters.q.trim()
  if (q !== '') query.q = q
  if (isTenderStatus(filters.status)) query.status = filters.status
  if (isLawType(filters.law_type)) query.law_type = filters.law_type
  const region = filters.region.trim()
  if (region !== '') query.region = region
  const priceMin = Number(filters.price_min)
  const priceMax = Number(filters.price_max)
  if (Number.isFinite(priceMin) && priceMin > 0) query.price_min = Math.round(priceMin * 100)
  if (Number.isFinite(priceMax) && priceMax > 0) query.price_max = Math.round(priceMax * 100)
  if (isAccessType(filters.access_type)) query.access_type = filters.access_type
  return query
}

/** Скелетон строк таблицы на время первичной загрузки. */
function TendersTableSkeleton() {
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Номер</TableHead>
              <TableHead>Название</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead className="text-right">НМЦК</TableHead>
              <TableHead>Регион</TableHead>
              <TableHead>Дедлайн подачи</TableHead>
              <TableHead className="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 6 }, (_, index) => (
              <TableRow key={index}>
                <TableCell>
                  <div className="bg-muted h-4 w-24 animate-pulse rounded" />
                </TableCell>
                <TableCell>
                  <div className="bg-muted h-4 w-56 animate-pulse rounded" />
                  <div className="bg-muted mt-1.5 h-3 w-32 animate-pulse rounded" />
                </TableCell>
                <TableCell>
                  <div className="bg-muted h-5 w-24 animate-pulse rounded-full" />
                </TableCell>
                <TableCell>
                  <div className="bg-muted ml-auto h-4 w-28 animate-pulse rounded" />
                </TableCell>
                <TableCell>
                  <div className="bg-muted h-4 w-20 animate-pulse rounded" />
                </TableCell>
                <TableCell>
                  <div className="bg-muted h-4 w-32 animate-pulse rounded" />
                  <div className="bg-muted mt-1.5 h-3 w-24 animate-pulse rounded" />
                </TableCell>
                <TableCell className="text-right">
                  <div className="bg-muted ml-auto h-7 w-16 animate-pulse rounded-md" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

/**
 * Каталог тендеров (GET /tenders, курсорная пагинация).
 * - Фильтры — в query-параметрах URL (шерингуются ссылкой), применяются по кнопке.
 * - Первая страница — useQuery с keepPreviousData (при смене фильтров старый
 *   список не мигает), последующие — fetchQuery по курсору. Накопленный список
 *   живёт в useCursorPage.
 */
export function TendersPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { user } = useAuth()

  // Создание тендера — customer-роль (tender.create): агент создавать не может.
  // Плюс org_pending (FR-1.5.7): неподтверждённая компания тендеры не создаёт.
  const gate = useCompanyGate()
  const hasCreateRole = user?.role !== 'agent'
  const canCreateTender = hasCreateRole && gate.canAct

  const filters = useMemo(() => readFilters(searchParams), [searchParams])
  const apiQuery = useMemo(() => filtersToQuery(filters), [filters])
  const filtersKey = useMemo(() => JSON.stringify(filters), [filters])

  // Черновик формы фильтров: редактируется до нажатия «Применить», затем пишется в URL.
  const [draft, setDraft] = useState<TenderFilters>(filters)
  useEffect(() => {
    setDraft(readFilters(searchParams))
  }, [searchParams])

  const firstPageQuery = useQuery({
    queryKey: ['tenders', filters, null],
    queryFn: () => listTenders(apiQuery),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })

  const { items, isFetchingMore, hasMore, loadMore, reset } =
    useCursorPage<TenderListItem>()

  // Аккумулятор useCursorPage наполняется первой страницей из useQuery.
  // Пересобираем его при смене фильтров и при свежих данных первой страницы
  // (рефетч по фокусу после staleTime — иначе таблица навсегда осталась бы со
  // статусами и сроками на момент открытия). Единственное исключение — уже
  // догруженные страницы: их перезалив «перемотал» бы список к началу, поэтому
  // после «Показать ещё» обновление ждёт смены фильтров.
  const primedFiltersKey = useRef<string | null>(null)
  const primedData = useRef<unknown>(null)
  const loadedBeyondFirstPage = useRef(false)

  useEffect(() => {
    if (!firstPageQuery.isSuccess || firstPageQuery.isPlaceholderData) return
    const data = firstPageQuery.data
    const filtersChanged = primedFiltersKey.current !== filtersKey
    if (!filtersChanged && (loadedBeyondFirstPage.current || primedData.current === data)) return
    primedFiltersKey.current = filtersKey
    primedData.current = data
    loadedBeyondFirstPage.current = false
    reset()
    void loadMore(() =>
      Promise.resolve<CursorPageData<TenderListItem>>({
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

  /** Догрузка следующей страницы по курсору (кэшируется в TanStack Query). */
  function fetchNextPage(cursor: string | null): Promise<CursorPageData<TenderListItem>> {
    return queryClient.fetchQuery({
      queryKey: ['tenders', filters, cursor],
      queryFn: () => listTenders(cursor == null ? apiQuery : { ...apiQuery, cursor }),
    })
  }

  function handleApply(event: FormEvent): void {
    event.preventDefault()
    const params = new URLSearchParams()
    const entries: ReadonlyArray<readonly [string, string]> = [
      ['q', draft.q.trim()],
      ['status', draft.status],
      ['law_type', draft.law_type],
      ['region', draft.region.trim()],
      ['price_min', draft.price_min.trim()],
      ['price_max', draft.price_max.trim()],
      ['access_type', draft.access_type],
    ]
    for (const [key, value] of entries) {
      if (value !== '') params.set(key, value)
    }
    setSearchParams(params)
  }

  function handleReset(): void {
    setDraft({ ...EMPTY_FILTERS })
    setSearchParams(new URLSearchParams())
  }

  const hasActiveFilters = Object.values(filters).some((value) => value !== '')
  const isLoading = firstPageQuery.isLoading
  const isError = firstPageQuery.isError
  const isEmpty = firstPageQuery.isSuccess && items.length === 0
  const loadMoreDisabled = isFetchingMore || firstPageQuery.isFetching

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Тендеры</h1>
          <p className="text-muted-foreground text-sm">
            Каталог тендеров с фильтрами и курсорной пагинацией.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Выгружается то, что отфильтровано на экране, а не вся база. */}
          <ExportButton exportType="tenders" filters={apiQuery as Record<string, unknown>} />
          {hasCreateRole &&
            (canCreateTender ? (
              <Button asChild>
                <Link to="/tenders/new">
                  <Plus className="size-4" />
                  Новый тендер
                </Link>
              </Button>
            ) : (
              <Button disabled title={companyGateHint(gate.status)}>
                <Plus className="size-4" />
                Новый тендер
              </Button>
            ))}
        </div>
      </div>

      {hasCreateRole && <CompanyGateBanner gate={gate} />}

      <form onSubmit={handleApply} className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label htmlFor="filter-q" className="text-sm font-medium">
            Поиск
          </label>
          <Input
            id="filter-q"
            type="search"
            value={draft.q}
            onChange={(event) => setDraft({ ...draft, q: event.target.value })}
            placeholder="Номер, название…"
            className="w-56"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Статус</label>
          <Select
            value={draft.status === '' ? ALL_VALUE : draft.status}
            onValueChange={(value) =>
              setDraft({ ...draft, status: value === ALL_VALUE ? '' : value })
            }
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Все статусы" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>Все статусы</SelectItem>
              {TENDER_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {TENDER_STATUS_LABELS[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Закон</label>
          <Select
            value={draft.law_type === '' ? ALL_VALUE : draft.law_type}
            onValueChange={(value) =>
              setDraft({ ...draft, law_type: value === ALL_VALUE ? '' : value })
            }
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Все законы" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>Все законы</SelectItem>
              {LAW_TYPES.map((lawType) => (
                <SelectItem key={lawType} value={lawType}>
                  {LAW_TYPE_LABELS[lawType]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="filter-region" className="text-sm font-medium">
            Регион
          </label>
          <Input
            id="filter-region"
            type="text"
            value={draft.region}
            onChange={(event) => setDraft({ ...draft, region: event.target.value })}
            placeholder="Регион"
            className="w-40"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="filter-price-min" className="text-sm font-medium">
            НМЦК от, ₽
          </label>
          <Input
            id="filter-price-min"
            type="number"
            min={0}
            step={0.01}
            inputMode="decimal"
            value={draft.price_min}
            onChange={(event) => setDraft({ ...draft, price_min: event.target.value })}
            placeholder="0"
            className="w-32"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="filter-price-max" className="text-sm font-medium">
            НМЦК до, ₽
          </label>
          <Input
            id="filter-price-max"
            type="number"
            min={0}
            step={0.01}
            inputMode="decimal"
            value={draft.price_max}
            onChange={(event) => setDraft({ ...draft, price_max: event.target.value })}
            placeholder="∞"
            className="w-32"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Доступ</label>
          <Select
            value={draft.access_type === '' ? ALL_VALUE : draft.access_type}
            onValueChange={(value) =>
              setDraft({ ...draft, access_type: value === ALL_VALUE ? '' : value })
            }
          >
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Любой" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>Любой</SelectItem>
              {ACCESS_TYPES.map((accessType) => (
                <SelectItem key={accessType} value={accessType}>
                  {ACCESS_TYPE_LABELS[accessType]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2 pb-px">
          <Button type="submit">Применить</Button>
          <Button type="button" variant="ghost" onClick={handleReset}>
            Сбросить
          </Button>
        </div>
      </form>

      {isError ? (
        <Card>
          <CardContent className="space-y-4">
            <p className="text-destructive text-sm">
              Не удалось загрузить список тендеров: {apiErrorMessage(firstPageQuery.error)}
            </p>
            <Button variant="outline" onClick={() => void firstPageQuery.refetch()}>
              Повторить
            </Button>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <TendersTableSkeleton />
      ) : isEmpty ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-muted-foreground text-sm">Ничего не найдено</p>
            {hasActiveFilters && (
              <Button variant="outline" size="sm" onClick={handleReset}>
                Сбросить фильтры
              </Button>
            )}
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
                    <TableHead>Название</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead className="text-right">НМЦК</TableHead>
                    <TableHead>Регион</TableHead>
                    <TableHead>Дедлайн подачи</TableHead>
                    <TableHead className="text-right">Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((tender) => {
                    const lotCount = tender.lot_count
                    const href = `/tenders/${tender.id}`
                    // Строка целиком ведёт в карточку: кнопка «Открыть» остаётся
                    // как явная точка входа, но кликать можно куда угодно в строке.
                    const open = (): void => {
                      if (tender.id != null) navigate(href)
                    }
                    return (
                      <TableRow
                        key={tender.id}
                        role="link"
                        tabIndex={0}
                        aria-label={tender.title || tender.number || 'Тендер'}
                        className="cursor-pointer"
                        onClick={open}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            open()
                          }
                        }}
                      >
                        <TableCell>
                          <span className="font-mono text-muted-foreground text-xs">
                            {tender.number || '—'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{tender.title || '—'}</div>
                          {lotCount != null && (
                            <div className="text-muted-foreground text-xs">
                              {lotCount} {plural(lotCount, ['лот', 'лота', 'лотов'])}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <TenderStatusBadge status={tender.status} />
                        </TableCell>
                        <TableCell className="font-semibold text-right tabular-nums">
                          {tender.nmck_minor != null
                            ? formatMoney(tender.nmck_minor, tender.currency)
                            : '—'}
                        </TableCell>
                        <TableCell>{tender.region || '—'}</TableCell>
                        <TableCell>
                          {tender.deadline != null ? (
                            <>
                              <div>{formatDateTime(tender.deadline)}</div>
                              <div className="text-muted-foreground text-xs">
                                {formatRemaining(tender.deadline)}
                              </div>
                            </>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell
                          className="text-right"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <Button asChild variant="outline" size="sm">
                            <Link to={href}>Открыть</Link>
                          </Button>
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
                disabled={loadMoreDisabled}
                onClick={() => {
                  loadedBeyondFirstPage.current = true
                  void loadMore(fetchNextPage)
                }}
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
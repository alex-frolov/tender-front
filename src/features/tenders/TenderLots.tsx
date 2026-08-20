import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Gavel, Pencil, Plus, Trash2 } from 'lucide-react'
import {
  createLot,
  deleteLot,
  listAuctions,
  updateLot,
  type AuctionListItem,
  type LotCreate,
  type LotUpdate,
} from '@/api/endpoints'
import type { components } from '@/api/schema'
import { Badge } from '@/components/ui/badge'
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
import { AuctionCreateForm } from '@/features/auction/AuctionCreateForm'
import { AuctionStatusBadge } from '@/features/auction/AuctionStatusBadge'
import { useAuth } from '@/features/auth/AuthContext'
import { apiErrorMessage } from '@/lib/errors'
import { formatMoney } from '@/lib/money'
import { canManageTender } from '@/lib/tenderAccess'

type Tender = components['schemas']['Tender']
type Lot = components['schemas']['Lot']
type TenderStatus = components['schemas']['TenderStatus']

/** Лоты правятся только до окончания приёма заявок (иначе бэкенд ответит 409). */
const EDITABLE: readonly TenderStatus[] = ['draft', 'published', 'withdrawn', 'accepting_bids']

/** Поля формы лота. */
interface LotFormState {
  title: string
  priceNet: string
  vatRate: string
  quantity: string
  unit: string
}

const EMPTY_FORM: LotFormState = {
  title: '',
  priceNet: '',
  vatRate: '',
  quantity: '',
  unit: '',
}

/** Рубли из формы → minor units (целые копейки). */
function toMinor(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const parsed = Number(trimmed.replace(',', '.'))
  if (!Number.isFinite(parsed)) return null
  return Math.round(parsed * 100)
}

/** Minor units → строка для input в рублях. */
function toRubles(minor: number | undefined): string {
  return minor == null ? '' : String(minor / 100)
}

/** Общие поля формы лота (используются и при создании, и при правке). */
function LotFields({
  state,
  onChange,
  idPrefix,
}: {
  state: LotFormState
  onChange: (next: LotFormState) => void
  idPrefix: string
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div className="space-y-1.5 sm:col-span-2">
        <label htmlFor={`${idPrefix}-title`} className="text-sm font-medium">
          Наименование
        </label>
        <Input
          id={`${idPrefix}-title`}
          value={state.title}
          onChange={(event) => onChange({ ...state, title: event.target.value })}
          maxLength={500}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`${idPrefix}-price`} className="text-sm font-medium">
          Цена без НДС, ₽
        </label>
        <Input
          id={`${idPrefix}-price`}
          type="number"
          min={0}
          step={0.01}
          inputMode="decimal"
          value={state.priceNet}
          onChange={(event) => onChange({ ...state, priceNet: event.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`${idPrefix}-vat`} className="text-sm font-medium">
          НДС, %
        </label>
        <Input
          id={`${idPrefix}-vat`}
          type="number"
          min={0}
          max={100}
          value={state.vatRate}
          onChange={(event) => onChange({ ...state, vatRate: event.target.value })}
          placeholder="как в тендере"
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`${idPrefix}-quantity`} className="text-sm font-medium">
          Количество
        </label>
        <Input
          id={`${idPrefix}-quantity`}
          type="number"
          min={0}
          step={0.001}
          inputMode="decimal"
          value={state.quantity}
          onChange={(event) => onChange({ ...state, quantity: event.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`${idPrefix}-unit`} className="text-sm font-medium">
          Единица измерения
        </label>
        <Input
          id={`${idPrefix}-unit`}
          value={state.unit}
          onChange={(event) => onChange({ ...state, unit: event.target.value })}
          placeholder="шт."
          maxLength={50}
        />
      </div>
    </div>
  )
}

/**
 * Лоты тендера: таблица + CRUD (POST/PATCH/DELETE /tenders/{id}/lots) и
 * создание аукциона из лота.
 *
 * Управление доступно admin/manager КОМПАНИИ-ЗАКАЗЧИКА (agent — 403, чужая
 * компания — 404 на мутации лотов) и только в статусах до окончания приёма
 * заявок. Участнику таблица видна в режиме чтения.
 *
 * Аукцион на лоте один и навсегда: если он уже есть, колонка «Аукцион»
 * показывает его статус и ссылку на торги, а кнопки создания нет — повторное
 * создание бэкенд отбивает 409 в любом статусе первого аукциона.
 *
 * НМЦК тендера — производная от лотов (FR-1.1.7): после добавления, правки цены
 * или удаления лота бэкенд пересчитывает её как сумму price_net_minor всех
 * лотов. Отдельного поля НМЦК в TenderUpdate нет, менять её иначе нельзя.
 * Последний лот удалить нельзя (тендер без лотов не публикуется).
 */
export function TenderLots({ tender }: { tender: Tender }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState<LotFormState>(EMPTY_FORM)
  const [createError, setCreateError] = useState<string | null>(null)

  const [editingLotId, setEditingLotId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<LotFormState>(EMPTY_FORM)
  const [editError, setEditError] = useState<string | null>(null)

  const [rowError, setRowError] = useState<string | null>(null)
  const [auctionLotId, setAuctionLotId] = useState<string | null>(null)

  const tenderId = tender.id ?? ''
  const lots = tender.lots ?? []
  const currency = tender.currency

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['tender', tenderId] })
    void queryClient.invalidateQueries({ queryKey: ['tenders'] })
  }

  const createMutation = useMutation({
    mutationFn: (input: LotCreate) => createLot(tenderId, input),
    onSuccess: invalidate,
  })
  const updateMutation = useMutation({
    mutationFn: ({ lotId, input }: { lotId: string; input: LotUpdate }) =>
      updateLot(tenderId, lotId, input),
    onSuccess: invalidate,
  })
  const deleteMutation = useMutation({
    mutationFn: (lotId: string) => deleteLot(tenderId, lotId),
    onSuccess: invalidate,
  })

  const status = tender.status ?? 'draft'
  const canManage = canManageTender(tender, user) && EDITABLE.includes(status)

  // Аукционы, видимые компании (GET /auctions, без пагинации — по одному
  // аукциону на лот). Нужны в таблице, чтобы показать статус торгов по лоту и
  // не предлагать создать второй аукцион: бэкенд отбивает повтор 409
  // («Auction already exists for the lot») независимо от статуса первого.
  const auctionsQuery = useQuery({
    queryKey: ['auctions'],
    queryFn: listAuctions,
    staleTime: 30_000,
  })

  const auctionByLotId = useMemo(() => {
    const map = new Map<string, AuctionListItem>()
    for (const auction of auctionsQuery.data ?? []) {
      if (auction.lot_id != null) map.set(auction.lot_id, auction)
    }
    return map
  }, [auctionsQuery.data])

  const lotsSumMinor = lots.reduce((sum, lot) => sum + (lot.price_net_minor ?? 0), 0)
  const nmckMinor = tender.nmck_minor
  // Расхождение суммы с НМЦК после мутаций невозможно (бэкенд пересчитывает
  // НМЦК), но карточка может быть из кэша — тогда честно показываем расхождение
  // как «данные устарели», а не как ошибку сохранения.
  const sumMismatch = nmckMinor != null && lots.length > 0 && lotsSumMinor !== nmckMinor

  function openCreate(): void {
    setCreateForm({ ...EMPTY_FORM, vatRate: tender.vat_rate != null ? String(tender.vat_rate) : '' })
    setCreateError(null)
    setEditingLotId(null)
    setAuctionLotId(null)
    setCreateOpen(true)
  }

  function openEdit(lot: Lot): void {
    setEditForm({
      title: lot.title ?? '',
      priceNet: toRubles(lot.price_net_minor),
      vatRate: lot.vat_rate != null ? String(lot.vat_rate) : '',
      quantity: lot.quantity != null ? String(lot.quantity) : '',
      unit: lot.unit ?? '',
    })
    setEditError(null)
    setCreateOpen(false)
    setAuctionLotId(null)
    setEditingLotId(lot.id ?? null)
  }

  async function handleCreateSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setCreateError(null)

    const title = createForm.title.trim()
    const priceNet = toMinor(createForm.priceNet)
    if (title === '') {
      setCreateError('Укажите наименование лота.')
      return
    }
    if (priceNet == null || priceNet < 0) {
      setCreateError('Укажите цену лота без НДС.')
      return
    }

    // trade_end_lead_hours обязателен в LotCreate (default 0 по контракту).
    const input: LotCreate = { title, price_net_minor: priceNet, trade_end_lead_hours: 0 }
    const vat = Number(createForm.vatRate)
    if (createForm.vatRate.trim() !== '' && Number.isFinite(vat)) input.vat_rate = vat
    const quantity = Number(createForm.quantity.replace(',', '.'))
    if (createForm.quantity.trim() !== '' && Number.isFinite(quantity)) input.quantity = quantity
    if (createForm.unit.trim() !== '') input.unit = createForm.unit.trim()

    try {
      await createMutation.mutateAsync(input)
      setCreateOpen(false)
      setCreateForm(EMPTY_FORM)
    } catch (err) {
      setCreateError(apiErrorMessage(err))
    }
  }

  async function handleEditSubmit(event: FormEvent, lotId: string): Promise<void> {
    event.preventDefault()
    setEditError(null)

    const lot = lots.find((item) => item.id === lotId)
    if (lot == null) {
      setEditError('Лот не найден — обновите страницу.')
      return
    }

    // Отправляем только то, что реально изменилось относительно лота: раньше
    // unit писался всегда, из-за чего «Нет изменений» было недостижимо, а
    // сохранение без правок отправляло PATCH и затирало единицу пустой строкой.
    const input: LotUpdate = {}
    const title = editForm.title.trim()
    if (title === '') {
      setEditError('Название лота не может быть пустым.')
      return
    }
    if (title !== (lot.title ?? '')) input.title = title

    const priceNet = toMinor(editForm.priceNet)
    if (editForm.priceNet.trim() === '') {
      setEditError('Укажите цену лота без НДС.')
      return
    }
    if (priceNet == null) {
      setEditError('Цена лота — число.')
      return
    }
    if (priceNet !== lot.price_net_minor) input.price_net_minor = priceNet

    if (editForm.vatRate.trim() !== '') {
      const vat = Number(editForm.vatRate.replace(',', '.'))
      if (!Number.isFinite(vat)) {
        setEditError('Ставка НДС — число.')
        return
      }
      if (vat !== lot.vat_rate) input.vat_rate = vat
    }

    if (editForm.quantity.trim() !== '') {
      const quantity = Number(editForm.quantity.replace(',', '.'))
      if (!Number.isFinite(quantity)) {
        setEditError('Количество — число.')
        return
      }
      if (quantity !== lot.quantity) input.quantity = quantity
    }

    // Пустая единица очищает её на сервере — но только если там что-то было.
    const unit = editForm.unit.trim()
    if (unit !== (lot.unit ?? '')) input.unit = unit

    if (Object.keys(input).length === 0) {
      setEditError('Нет изменений: измените хотя бы одно поле.')
      return
    }

    try {
      await updateMutation.mutateAsync({ lotId, input })
      setEditingLotId(null)
    } catch (err) {
      setEditError(apiErrorMessage(err))
    }
  }

  async function handleDelete(lot: Lot): Promise<void> {
    const lotId = lot.id
    if (lotId == null) return
    if (!window.confirm(`Удалить лот «${lot.title ?? lotId}»? НМЦК будет пересчитан.`)) return
    setRowError(null)
    try {
      await deleteMutation.mutateAsync(lotId)
    } catch (err) {
      setRowError(apiErrorMessage(err))
    }
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base">Лоты</CardTitle>
            {lots.length > 0 && (
              <p className="text-muted-foreground text-sm">
                Сумма лотов: {formatMoney(lotsSumMinor, currency)}
                {nmckMinor != null && ` · НМЦК: ${formatMoney(nmckMinor, currency)}`}
                {tender.no_start_price !== true && ' · НМЦК = сумма лотов'}
              </p>
            )}
          </div>
          {canManage && (
            <Button size="sm" onClick={openCreate}>
              <Plus className="size-4" />
              Добавить лот
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {sumMismatch && (
            <p className="text-muted-foreground px-6 pb-3 text-sm">
              Сумма лотов отличается от НМЦК в карточке — обновите страницу,
              НМЦК пересчитывается по лотам.
            </p>
          )}
          {rowError != null && <p className="text-destructive px-6 pb-3 text-sm">{rowError}</p>}
          {lots.length === 0 ? (
            <p className="text-muted-foreground px-6 py-4 text-sm">Лоты не найдены.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">№</TableHead>
                  <TableHead>Наименование</TableHead>
                  <TableHead className="text-right">Сумма (без НДС)</TableHead>
                  <TableHead className="text-right">Сумма (с НДС)</TableHead>
                  <TableHead>Победитель</TableHead>
                  <TableHead>Аукцион</TableHead>
                  {canManage && <TableHead className="text-right">Действия</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {lots.map((lot: Lot) => {
                  const auction = lot.id != null ? auctionByLotId.get(lot.id) : undefined
                  return (
                  <TableRow key={lot.id}>
                    <TableCell>
                      <span className="font-mono text-muted-foreground text-xs">
                        {lot.number ?? '—'}
                      </span>
                    </TableCell>
                    <TableCell className="font-medium">{lot.title || '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {lot.price_net_minor != null
                        ? formatMoney(lot.price_net_minor, currency)
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {lot.price_gross_minor != null
                        ? formatMoney(lot.price_gross_minor, currency)
                        : '—'}
                    </TableCell>
                    <TableCell>
                      {lot.winner_bid_id != null ? (
                        <Badge variant="success">Победитель</Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {auction != null ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <AuctionStatusBadge status={auction.status} />
                          <Link
                            to={`/auctions/${auction.id}`}
                            className="text-primary text-xs underline-offset-4 hover:underline"
                          >
                            Открыть
                          </Link>
                        </div>
                      ) : auctionsQuery.isLoading ? (
                        <span className="text-muted-foreground text-xs">…</span>
                      ) : (
                        <span className="text-muted-foreground text-xs">не создан</span>
                      )}
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => openEdit(lot)}>
                            <Pencil className="size-4" />
                            Изменить
                          </Button>
                          {auction == null && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={auctionsQuery.isLoading}
                              onClick={() => {
                                setCreateOpen(false)
                                setEditingLotId(null)
                                setAuctionLotId(lot.id ?? null)
                              }}
                            >
                              <Gavel className="size-4" />
                              Создать аукцион
                            </Button>
                          )}
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={deleteMutation.isPending || lots.length === 1}
                            title={
                              lots.length === 1
                                ? 'Последний лот удалить нельзя'
                                : 'Удалить лот'
                            }
                            onClick={() => void handleDelete(lot)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {canManage && createOpen && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Новый лот</CardTitle>
            <p className="text-muted-foreground text-sm">
              Номер назначается автоматически. Цена нового лота прибавляется к НМЦК
              тендера: указывать её «в пределах» текущей НМЦК не нужно.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <LotFields state={createForm} onChange={setCreateForm} idPrefix="lot-create" />
              {createError != null && <p className="text-destructive text-sm">{createError}</p>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
                  Отмена
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Добавляем…' : 'Добавить лот'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {canManage && editingLotId != null && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Изменение лота</CardTitle>
            <p className="text-muted-foreground text-sm">
              Поля заполнены текущими значениями; отправляются только изменённые.
              Пустое количество оставляет текущее значение, пустая единица
              измерения — очищает её. Смена цены лота пересчитывает НМЦК тендера.
            </p>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(event) => void handleEditSubmit(event, editingLotId)}
              className="space-y-4"
            >
              <LotFields state={editForm} onChange={setEditForm} idPrefix="lot-edit" />
              {editError != null && <p className="text-destructive text-sm">{editError}</p>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setEditingLotId(null)}>
                  Отмена
                </Button>
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? 'Сохраняем…' : 'Сохранить'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {canManage && auctionLotId != null && auctionByLotId.get(auctionLotId) == null && (
        <AuctionCreateForm
          lotId={auctionLotId}
          lotTitle={lots.find((lot) => lot.id === auctionLotId)?.title ?? 'лот'}
          onCancel={() => setAuctionLotId(null)}
          onCreated={(auctionId) => {
            setAuctionLotId(null)
            invalidate()
            if (auctionId != null) navigate(`/auctions/${auctionId}`)
          }}
        />
      )}
    </div>
  )
}

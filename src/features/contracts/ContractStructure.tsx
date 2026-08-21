import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link2, ListChecks } from 'lucide-react'
import {
  bindTenderToContract,
  createContractStage,
  type Contract,
  type ContractTender,
} from '@/api/endpoints'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  contractStageStatusLabel,
  CONTRACT_TENDER_STATUS_BADGE_VARIANTS,
  CONTRACT_TENDER_STATUS_LABELS,
} from '@/lib/contracts'
import { apiErrorMessage } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'
import { formatMoney } from '@/lib/money'

/** Рубли из формы → minor units. */
function toMinor(value: string): number | null {
  if (value.trim() === '') return null
  const parsed = Number(value.replace(',', '.'))
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null
}

/**
 * Этапы одной привязки «договор — тендер» плюс форма добавления
 * (POST /contract_tenders/{id}/stages).
 *
 * Этапы создают обе стороны договора: заказчик — по праву `contracts.sign`,
 * исполнитель — по принадлежности к договору. Номер не спрашиваем: бэкенд
 * назначает следующий по порядку, а ручная нумерация только плодит дыры.
 */
function TenderStages({ bound, contractId }: { bound: ContractTender; contractId: string }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (input: { title: string; amount_minor?: number; due_at?: string }) =>
      createContractStage(bound.id ?? '', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['contract', contractId] })
    },
  })

  const stages = bound.stages ?? []

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setError(null)
    if (title.trim() === '') {
      setError('Укажите название этапа.')
      return
    }
    const amountMinor = toMinor(amount)
    try {
      await mutation.mutateAsync({
        title: title.trim(),
        ...(amountMinor == null ? {} : { amount_minor: amountMinor }),
        // datetime-local отдаёт локальное время без зоны — переводим в ISO с зоной.
        ...(dueAt === '' ? {} : { due_at: new Date(dueAt).toISOString() }),
      })
      setOpen(false)
      setTitle('')
      setAmount('')
      setDueAt('')
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }

  return (
    <div className="space-y-2 pl-4">
      {stages.length === 0 ? (
        <p className="text-muted-foreground text-xs">Этапы не заведены.</p>
      ) : (
        <ul className="space-y-1">
          {stages.map((stage) => (
            <li key={stage.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground tabular-nums">{stage.number}.</span>
              <span>{stage.title}</span>
              {stage.amount_minor != null && (
                <span className="tabular-nums">{formatMoney(stage.amount_minor)}</span>
              )}
              {stage.due_at != null && (
                <span className="text-muted-foreground text-xs">
                  до {formatDateTime(stage.due_at)}
                </span>
              )}
              {stage.status != null && (
                <Badge variant={stage.status === 'accepted' ? 'success' : 'secondary'}>
                  {contractStageStatusLabel(stage.status)}
                </Badge>
              )}
            </li>
          ))}
        </ul>
      )}

      {open ? (
        <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Название этапа</label>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Поставка оборудования"
              className="w-64"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Сумма, ₽</label>
            <Input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="w-32"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Срок</label>
            <Input
              type="datetime-local"
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
              className="w-52"
            />
          </div>
          <Button type="submit" size="sm" disabled={mutation.isPending}>
            {mutation.isPending ? 'Добавляем…' : 'Добавить'}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Отмена
          </Button>
          {error != null && <p className="text-destructive w-full text-sm">{error}</p>}
        </form>
      ) : (
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
          <ListChecks className="size-4" />
          Добавить этап
        </Button>
      )}
    </div>
  )
}

/**
 * Структура договора: привязанные процедуры с этапами исполнения и форма
 * привязки нового тендера (POST /contracts/{id}/tenders).
 *
 * Привязывает только заказчик; у договора с областью «одна процедура» вторая
 * привязка вернёт 409, поэтому форма показывается лишь там, где привязка
 * действительно возможна.
 */
export function ContractStructure({
  contract,
  isCustomer,
}: {
  contract: Contract
  isCustomer: boolean
}) {
  const queryClient = useQueryClient()
  const contractId = contract.id ?? ''
  const bindings = contract.tenders ?? []

  const [open, setOpen] = useState(false)
  const [tenderId, setTenderId] = useState('')
  const [lotId, setLotId] = useState('')
  const [price, setPrice] = useState('')
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (input: { tender_id: string; lot_id?: string; price_net_minor: number }) =>
      bindTenderToContract(contractId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['contract', contractId] })
      void queryClient.invalidateQueries({ queryKey: ['contracts'] })
    },
  })

  // single_use допускает ровно одну процедуру: показывать форму, заведомо
  // отвечающую 409, незачем.
  const canBind =
    isCustomer && (contract.scope === 'multi_use' || bindings.length === 0)

  async function handleBind(event: FormEvent): Promise<void> {
    event.preventDefault()
    setError(null)
    const priceMinor = toMinor(price)
    if (tenderId.trim() === '') {
      setError('Укажите идентификатор тендера.')
      return
    }
    if (priceMinor == null) {
      setError('Укажите цену привязки.')
      return
    }
    try {
      await mutation.mutateAsync({
        tender_id: tenderId.trim(),
        ...(lotId.trim() === '' ? {} : { lot_id: lotId.trim() }),
        price_net_minor: priceMinor,
      })
      setOpen(false)
      setTenderId('')
      setLotId('')
      setPrice('')
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Привязанные процедуры и этапы</h3>
        {canBind && !open && (
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            <Link2 className="size-4" />
            Привязать тендер
          </Button>
        )}
      </div>

      {bindings.length === 0 ? (
        <p className="text-muted-foreground text-sm">Процедуры не привязаны.</p>
      ) : (
        <div className="space-y-3">
          {bindings.map((bound) => (
            <div key={bound.id} className="space-y-2 rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground font-mono text-xs">
                  {bound.tender_id?.slice(0, 8)}
                </span>
                {bound.lot_id != null && (
                  <span className="text-muted-foreground text-xs">
                    лот {bound.lot_id.slice(0, 8)}
                  </span>
                )}
                <span className="tabular-nums">
                  {bound.price_net_minor != null ? formatMoney(bound.price_net_minor) : '—'}
                </span>
                {bound.status != null && (
                  <Badge variant={CONTRACT_TENDER_STATUS_BADGE_VARIANTS[bound.status] ?? 'neutral'}>
                    {CONTRACT_TENDER_STATUS_LABELS[bound.status] ?? bound.status}
                  </Badge>
                )}
              </div>
              <TenderStages bound={bound} contractId={contractId} />
            </div>
          ))}
        </div>
      )}

      {open && (
        <form onSubmit={handleBind} className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Тендер (id)</label>
            <Input
              value={tenderId}
              onChange={(event) => setTenderId(event.target.value)}
              className="w-72"
              placeholder="id своей процедуры"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Лот (id, необязательно)</label>
            <Input
              value={lotId}
              onChange={(event) => setLotId(event.target.value)}
              className="w-72"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Цена без НДС, ₽</label>
            <Input
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              className="w-40"
            />
          </div>
          <Button type="submit" size="sm" disabled={mutation.isPending}>
            {mutation.isPending ? 'Привязываем…' : 'Привязать'}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Отмена
          </Button>
          {error != null && <p className="text-destructive w-full text-sm">{error}</p>}
        </form>
      )}
    </div>
  )
}

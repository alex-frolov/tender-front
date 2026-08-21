import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { submitBid, type Bid, type BidCreate } from '@/api/bids'
import type { components } from '@/api/schema'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation'
import { apiErrorMessage } from '@/lib/errors'
import { formatMoney } from '@/lib/money'

type Tender = components['schemas']['Tender']

/** Рубли из формы → minor units (целые копейки), как того требует контракт. */
function toMinor(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const parsed = Number(trimmed.replace(',', '.'))
  if (!Number.isFinite(parsed)) return null
  return Math.round(parsed * 100)
}

/**
 * Подача заявки на лот (POST /tenders/{id}/bids).
 *
 * Заявка подаётся на конкретный лот: аукцион тоже создаётся по лоту, а допуск
 * к торгам сверяется по паре (тендер, лот) — заявка «на тендер целиком»
 * (lot_id = null) к лотовому аукциону не допускает. Бэкенд у тендера с лотами
 * такую заявку отклоняет (422), так что выбор лота здесь обязателен и в форме.
 *
 * Содержимое (part1, цена) шифруется на бэкенде и до вскрытия недоступно даже
 * заказчику (FR-1.2.2). Повторная подача на тот же лот до окончания приёма —
 * замена своей заявки, а не дубль (FR-1.2.5).
 */
export function BidSubmitForm({
  tender,
  supplierId,
  defaultLotId,
  onCancel,
  onSubmitted,
}: {
  tender: Tender
  supplierId: string
  defaultLotId?: string
  onCancel: () => void
  onSubmitted: (bid: Bid) => void
}) {
  const queryClient = useQueryClient()
  const lots = tender.lots ?? []
  const tenderId = tender.id ?? ''

  const [lotId, setLotId] = useState(defaultLotId ?? lots[0]?.id ?? '')
  const [price, setPrice] = useState('')
  const [characteristics, setCharacteristics] = useState('')
  const [error, setError] = useState<string | null>(null)

  const mutation = useIdempotentMutation<Bid, unknown, BidCreate>({
    mutationFn: (body, idempotencyKey) => submitBid({ tenderId, body, idempotencyKey }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bids', tenderId] })
    },
  })

  const selectedLot = lots.find((lot) => lot.id === lotId)

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setError(null)

    if (lotId === '') {
      setError('Выберите лот.')
      return
    }

    const body: BidCreate = {
      supplier_id: supplierId,
      lot_id: lotId,
      // part1 — свободный JSON (согласие, характеристики): бэкенд его только
      // шифрует и хранит, структуру задаёт клиент.
      part1: {
        consent: true,
        characteristics: characteristics.trim(),
      },
    }

    const priceMinor = toMinor(price)
    if (price.trim() !== '') {
      if (priceMinor == null || priceMinor < 0) {
        setError('Цена предложения должна быть неотрицательным числом.')
        return
      }
      body.price_minor = priceMinor
      // Базис и НДС наследуются от тендера: сравнивать предложения можно только
      // в одной канонической базе.
      if (tender.price_basis != null) body.price_basis = tender.price_basis
      if (tender.vat_rate != null) body.vat_rate = tender.vat_rate
    }

    try {
      onSubmitted(await mutation.mutateAsync(body))
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Подача заявки</CardTitle>
        <p className="text-muted-foreground text-sm">
          Содержимое заявки шифруется и до вскрытия недоступно заказчику. Повторная
          подача на тот же лот заменяет вашу заявку. К торгам допускает заказчик —
          до допуска ставки на аукционе не принимаются.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Лот</label>
              <Select value={lotId} onValueChange={setLotId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Выберите лот" />
                </SelectTrigger>
                <SelectContent>
                  {lots.map((lot) => (
                    <SelectItem key={lot.id} value={lot.id ?? ''}>
                      {`№${lot.number ?? '—'} · ${lot.title || 'без названия'}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedLot?.price_net_minor != null && (
                <p className="text-muted-foreground text-xs">
                  Цена лота без НДС: {formatMoney(selectedLot.price_net_minor, tender.currency)}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="bid-submit-price" className="text-sm font-medium">
                Цена предложения, ₽
              </label>
              <Input
                id="bid-submit-price"
                type="number"
                min={0}
                step={0.01}
                inputMode="decimal"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                placeholder="не указывать"
              />
              <p className="text-muted-foreground text-xs">
                Для конкурсных процедур. На аукционе цена определяется ставками.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="bid-submit-characteristics" className="text-sm font-medium">
              Характеристики предложения
            </label>
            <Textarea
              id="bid-submit-characteristics"
              value={characteristics}
              onChange={(event) => setCharacteristics(event.target.value)}
              rows={4}
              placeholder="Согласие с условиями закупки, характеристики товара/услуги"
            />
          </div>

          {error != null && <p className="text-destructive text-sm">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onCancel}>
              Отмена
            </Button>
            <Button type="submit" disabled={mutation.isPending || lots.length === 0}>
              {mutation.isPending ? 'Отправляем…' : 'Подать заявку'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

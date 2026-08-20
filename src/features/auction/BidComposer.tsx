import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Minus, Plus } from 'lucide-react'
import { postAuctionBid } from '@/api/endpoints'
import type { components } from '@/api/schema'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation'
import { apiErrorMessage } from '@/lib/errors'
import { formatMoney } from '@/lib/money'
import { isAuctionTrade } from './auctionStatus'
import { bidRules, inputToMinor, minorToInput, validateBid } from './bidRules'

type AuctionState = components['schemas']['AuctionState']
type AuctionBid = components['schemas']['AuctionBid']

interface BidComposerProps {
  auctionId: string
  state: AuctionState | undefined
}

/**
 * Форма ставки. Цена вводится в рублях и переводится в minor units (×100 —
 * конвенция проекта). Идемпотентность: один Idempotency-Key на действие
 * пользователя (useIdempotentMutation) — двойной клик/retry не создаёт дубль.
 *
 * Шаг аукциона (REDUCTION+fixed) не заставляет считать в уме: поле сразу
 * заполнено следующей допустимой ценой (текущая − шаг), стрелки ходят по шагу
 * и упираются в границы (лимит снизу, «текущая − шаг» сверху), а правило
 * написано текстом под полем. После своей ставки поле снова показывает
 * следующий шаг — от новой текущей цены.
 */
export function BidComposer({ auctionId, state }: BidComposerProps) {
  const queryClient = useQueryClient()
  const [price, setPrice] = useState('')
  // Пока поле не трогали руками, оно следует за рекомендованной ценой; после
  // ручной правки подстановка выключается, чтобы не затирать ввод.
  const [edited, setEdited] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const trading = isAuctionTrade(state?.status)
  const rules = useMemo(() => bidRules(state), [state])

  useEffect(() => {
    if (edited) return
    setPrice(rules.suggested != null ? minorToInput(rules.suggested) : '')
  }, [rules.suggested, edited])

  const mutation = useIdempotentMutation<
    AuctionBid,
    unknown,
    { auctionId: string; priceMinor: number }
  >({
    mutationFn: ({ auctionId: id, priceMinor }, idempotencyKey) =>
      postAuctionBid({ auctionId: id, priceMinor, idempotencyKey }),
    onSuccess: () => {
      // Поле возвращается к автоподстановке: после обновления состояния в нём
      // окажется следующий шаг от новой текущей цены.
      setEdited(false)
      setFormError(null)
      void queryClient.invalidateQueries({ queryKey: ['auction-bids', auctionId] })
      void queryClient.invalidateQueries({ queryKey: ['auction-state', auctionId] })
    },
  })

  const parsedMinor = price.trim() === '' ? null : inputToMinor(price)
  const validMinor = parsedMinor != null && Number.isFinite(parsedMinor) ? parsedMinor : null

  /** Сдвиг цены на шаг: −1 вниз (дешевле), +1 вверх, с упором в границы. */
  function adjust(direction: 1 | -1): void {
    if (rules.step == null) return
    const base = validMinor ?? rules.suggested ?? rules.max ?? rules.current ?? 0
    let next = base + direction * rules.step
    if (rules.max != null && next > rules.max) next = rules.max
    if (rules.min != null && next < rules.min) next = rules.min
    if (next <= 0) return
    setEdited(true)
    setFormError(null)
    setPrice(minorToInput(next))
  }

  const canStepDown =
    rules.step != null && (rules.min == null || (validMinor ?? rules.max ?? 0) > rules.min)
  const canStepUp =
    rules.step != null && (rules.max == null || (validMinor ?? rules.min ?? 0) < rules.max)

  function handleSubmit(event: FormEvent): void {
    event.preventDefault()
    if (validMinor == null) {
      setFormError('Введите цену больше нуля')
      return
    }
    const error = validateBid(validMinor, rules)
    if (error != null) {
      setFormError(error)
      return
    }
    setFormError(null)
    mutation.mutate({ auctionId, priceMinor: validMinor })
  }

  const apiError = mutation.isError ? apiErrorMessage(mutation.error) : null
  const disabled = !trading || mutation.isPending

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1.5">
          <label htmlFor="bid-price" className="text-sm font-medium">
            Цена, ₽
          </label>
          <div className="flex items-center gap-1">
            {/* Шаг аукциона: «−» дешевле на шаг, «+» дороже. Границы (лимит
                снизу и «текущая − шаг» сверху) гасят кнопки. */}
            {rules.step != null && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={`Дешевле на шаг ${formatMoney(rules.step)}`}
                title={`− шаг (${formatMoney(rules.step)})`}
                disabled={disabled || !canStepDown}
                onClick={() => adjust(-1)}
              >
                <Minus />
              </Button>
            )}
            <Input
              id="bid-price"
              type="number"
              min={0}
              // Шаг аукциона сюда не подставляем: HTML5 требует кратности value
              // шагу (от min), а правило торгов другое — «не выше текущей минус
              // шаг» (validateBid). При процентном шаге предложенная цена почти
              // никогда не кратна ему, и форма молча переставала отправляться.
              step={0.01}
              inputMode="decimal"
              value={price}
              onChange={(event) => {
                setEdited(true)
                setPrice(event.target.value)
              }}
              placeholder="0.00"
              className="w-44 text-center tabular-nums"
              disabled={disabled}
            />
            {rules.step != null && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={`Дороже на шаг ${formatMoney(rules.step)}`}
                title={`+ шаг (${formatMoney(rules.step)})`}
                disabled={disabled || !canStepUp}
                onClick={() => adjust(1)}
              >
                <Plus />
              </Button>
            )}
          </div>
        </div>
        <Button type="submit" disabled={disabled}>
          {mutation.isPending ? 'Отправляем…' : 'Сделать ставку'}
        </Button>
      </div>

      {rules.hint !== '' && <p className="text-muted-foreground text-xs">{rules.hint}</p>}
      {!trading && state != null && (
        <p className="text-muted-foreground text-xs">
          Ставки принимаются только в фазе «торги идут».
        </p>
      )}
      {trading && (
        <p className="text-muted-foreground text-xs">
          Торговаться может только допущенный участник: нужна заявка на этот лот
          со статусом «Допущена» (раздел «Заявки» в карточке тендера).
        </p>
      )}
      {formError != null && <p className="text-destructive text-sm">{formError}</p>}
      {apiError != null && <p className="text-destructive text-sm">{apiError}</p>}
    </form>
  )
}

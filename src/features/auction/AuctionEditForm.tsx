import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { SlidersHorizontal } from 'lucide-react'
import { updateAuction, type AuctionUpdate } from '@/api/endpoints'
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
import { apiErrorMessage } from '@/lib/errors'
import {
  AUCTION_TYPE_LABELS,
  STEP_MODE_LABELS,
  type AuctionStatus,
  type AuctionType,
  type StepMode,
} from './auctionStatus'
import { useAuctionParty } from './useAuctionParty'

type AuctionState = components['schemas']['AuctionState']

const AUCTION_TYPES: readonly AuctionType[] = ['reduction', 'free_price', 'price_request']
const STEP_MODES: readonly StepMode[] = ['fixed', 'free']

/** Статусы, в которых правка ещё разрешена: правила замораживаются на старте торгов. */
const EDITABLE_STATUSES: readonly AuctionStatus[] = ['draft', 'agreement', 'new', 'scheduled']

/** Рубли из формы → minor units; пустая строка — «поле не меняем». */
function toMinor(value: string): number | null {
  if (value.trim() === '') return null
  const parsed = Number(value.replace(',', '.'))
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null
}

/** minor units → строка для поля ввода. */
function fromMinor(value: number | null | undefined): string {
  return value == null ? '' : String(value / 100)
}

/**
 * Правка торговых параметров до старта (PATCH /auctions/{id}).
 *
 * Отправляются только изменённые поля: PATCH-семантика, а пустой запрос или
 * «те же значения» бэкенд отклоняет с 422 «nothing to update». Канонические
 * параметры лота (стартовая цена, НДС, база цены) и дата старта этим методом
 * не меняются — их нет в схеме, и лишнее поле дало бы 422.
 *
 * После старта торгов правка запрещена: правила уже заморожены в
 * rules_snapshot, поэтому форма живёт только до первого торга.
 */
export function AuctionEditForm({
  auctionId,
  state,
}: {
  auctionId: string
  state: AuctionState | undefined
}) {
  const queryClient = useQueryClient()
  const status = state?.status as AuctionStatus | undefined
  const editable = status != null && EDITABLE_STATUSES.includes(status)
  const { canControl } = useAuctionParty(state?.tender_id, editable)

  const [open, setOpen] = useState(false)
  const [type, setType] = useState<AuctionType>((state?.type as AuctionType) ?? 'reduction')
  const [stepMode, setStepMode] = useState<StepMode>((state?.step_mode as StepMode) ?? 'fixed')
  const [stepValue, setStepValue] = useState(fromMinor(state?.bid_step_minor))
  const [stepPercent, setStepPercent] = useState(
    state?.bid_step_percent_bps == null ? '' : String(state.bid_step_percent_bps / 100),
  )
  const [stepDuration, setStepDuration] = useState(
    state?.step_duration_sec == null ? '' : String(state.step_duration_sec),
  )
  const [maxExtensions, setMaxExtensions] = useState(
    state?.max_extensions == null ? '' : String(state.max_extensions),
  )
  const [priceMin, setPriceMin] = useState(fromMinor(state?.price_min_limit_minor))
  const [priceMax, setPriceMax] = useState(fromMinor(state?.price_max_limit_minor))
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const mutation = useMutation({
    mutationFn: (input: AuctionUpdate) => updateAuction(auctionId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['auction-state', auctionId] })
      void queryClient.invalidateQueries({ queryKey: ['auctions'] })
    },
  })

  if (!editable || !canControl) return null

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setError(null)
    setSaved(false)

    const input: AuctionUpdate = {}
    if (type !== state?.type) input.type = type
    if (stepMode !== state?.step_mode) input.step_mode = stepMode

    const stepMinor = toMinor(stepValue)
    if (stepMinor !== (state?.bid_step_minor ?? null)) input.bid_step_minor = stepMinor

    const percentValue = stepPercent.trim() === '' ? null : Number(stepPercent.replace(',', '.'))
    if (percentValue != null && !Number.isFinite(percentValue)) {
      setError('Шаг в процентах — число.')
      return
    }
    const percentBps = percentValue == null ? null : Math.round(percentValue * 100)
    if (percentBps !== (state?.bid_step_percent_bps ?? null)) {
      input.bid_step_percent_bps = percentBps
    }

    const minLimit = toMinor(priceMin)
    const maxLimit = toMinor(priceMax)
    if (minLimit != null && maxLimit != null && maxLimit < minLimit) {
      setError('Верхний лимит не может быть меньше нижнего.')
      return
    }
    if (minLimit !== (state?.price_min_limit_minor ?? null)) input.price_min_limit_minor = minLimit
    if (maxLimit !== (state?.price_max_limit_minor ?? null)) input.price_max_limit_minor = maxLimit

    const duration = stepDuration.trim() === '' ? null : Number(stepDuration)
    if (duration != null && (!Number.isFinite(duration) || duration <= 0)) {
      setError('Длительность шага — целое число секунд больше нуля.')
      return
    }
    if (duration != null && duration !== state?.step_duration_sec) {
      input.step_duration_sec = Math.round(duration)
    }

    const extensions = maxExtensions.trim() === '' ? null : Number(maxExtensions)
    if (extensions != null && (!Number.isFinite(extensions) || extensions < 0)) {
      setError('Число продлений — целое, не меньше нуля.')
      return
    }
    if (extensions != null && extensions !== state?.max_extensions) {
      input.max_extensions = Math.round(extensions)
    }

    // Пустой PATCH бэкенд отклонит с 422 — говорим об этом понятнее, чем он.
    if (Object.keys(input).length === 0) {
      setError('Ничего не изменено.')
      return
    }

    try {
      await mutation.mutateAsync(input)
      setSaved(true)
      setOpen(false)
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <SlidersHorizontal className="size-4" />
          Параметры торгов
        </CardTitle>
        {!open && (
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            Изменить
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {!open && (
          <p className="text-muted-foreground text-sm">
            Тип, шаг, лимиты и таймер можно менять, пока торги не начались. После старта
            правила замораживаются.
          </p>
        )}
        {saved && !open && <p className="text-sm text-emerald-600">Параметры сохранены.</p>}

        {open && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Тип аукциона</label>
                <Select value={type} onValueChange={(value) => setType(value as AuctionType)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AUCTION_TYPES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {AUCTION_TYPE_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Режим шага</label>
                <Select
                  value={stepMode}
                  onValueChange={(value) => setStepMode(value as StepMode)}
                  disabled={type !== 'reduction'}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STEP_MODES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {STEP_MODE_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-muted-foreground text-xs">
                  Свободное понижение — только для редукциона.
                </p>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="edit-step" className="text-sm font-medium">
                  Шаг, ₽
                </label>
                <Input
                  id="edit-step"
                  value={stepValue}
                  onChange={(event) => setStepValue(event.target.value)}
                  placeholder="10000"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="edit-step-percent" className="text-sm font-medium">
                  Шаг, %
                </label>
                <Input
                  id="edit-step-percent"
                  value={stepPercent}
                  onChange={(event) => setStepPercent(event.target.value)}
                  placeholder="0,5"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="edit-price-min" className="text-sm font-medium">
                  Нижний лимит цены, ₽
                </label>
                <Input
                  id="edit-price-min"
                  value={priceMin}
                  onChange={(event) => setPriceMin(event.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="edit-price-max" className="text-sm font-medium">
                  Верхний лимит цены, ₽
                </label>
                <Input
                  id="edit-price-max"
                  value={priceMax}
                  onChange={(event) => setPriceMax(event.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="edit-duration" className="text-sm font-medium">
                  Длительность шага, сек
                </label>
                <Input
                  id="edit-duration"
                  value={stepDuration}
                  onChange={(event) => setStepDuration(event.target.value)}
                  placeholder="600"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="edit-extensions" className="text-sm font-medium">
                  Максимум продлений
                </label>
                <Input
                  id="edit-extensions"
                  value={maxExtensions}
                  onChange={(event) => setMaxExtensions(event.target.value)}
                  placeholder="10"
                />
              </div>
            </div>

            {error != null && <p className="text-destructive text-sm">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Отмена
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Сохраняем…' : 'Сохранить'}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}

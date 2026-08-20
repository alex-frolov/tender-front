import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createAuction, type AuctionCreate } from '@/api/endpoints'
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
import {
  AUCTION_TYPE_LABELS,
  STEP_MODE_LABELS,
  type AuctionType,
  type StepMode,
} from '@/features/auction/auctionStatus'
import { apiErrorMessage } from '@/lib/errors'

const AUCTION_TYPES: readonly AuctionType[] = ['reduction', 'free_price', 'price_request']
const STEP_MODES: readonly StepMode[] = ['fixed', 'free']

/** Рубли из формы → minor units (целые копейки), как того требует контракт. */
function toMinor(value: string): number | null {
  const parsed = Number(value.replace(',', '.'))
  if (!Number.isFinite(parsed) || value.trim() === '') return null
  return Math.round(parsed * 100)
}

/**
 * Создание аукциона для лота (POST /auctions).
 * Цена, НДС и price_basis наследуются от лота — в форме только торговые
 * параметры: тип, режим и величина шага, длительность шага, лимиты, старт.
 * Шаг задаётся либо в рублях, либо в процентах от стартовой цены (bps);
 * для reduction+fixed бэкенд требует один из них.
 */
export function AuctionCreateForm({
  lotId,
  lotTitle,
  onCancel,
  onCreated,
}: {
  lotId: string
  lotTitle: string
  onCancel: () => void
  onCreated: (auctionId: string | undefined) => void
}) {
  const queryClient = useQueryClient()

  const [type, setType] = useState<AuctionType>('reduction')
  const [stepMode, setStepMode] = useState<StepMode>('fixed')
  const [stepValue, setStepValue] = useState('')
  const [stepPercent, setStepPercent] = useState('')
  const [stepDuration, setStepDuration] = useState('600')
  const [maxExtensions, setMaxExtensions] = useState('10')
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')
  const [scheduledStart, setScheduledStart] = useState('')
  const [error, setError] = useState<string | null>(null)

  const createMutation = useMutation({
    mutationFn: (input: AuctionCreate) => createAuction(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['auctions'] })
    },
  })

  const needsStep = type === 'reduction' && stepMode === 'fixed'

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setError(null)

    const input: AuctionCreate = { lot_id: lotId, type }
    if (type === 'reduction') input.step_mode = stepMode

    const stepMinor = toMinor(stepValue)
    // NaN != null, поэтому нечисловой процент раньше считался «шаг указан»:
    // проверка ниже пропускала форму, а запрос уходил вообще без шага.
    const percentValue = stepPercent.trim() === '' ? null : Number(stepPercent.replace(',', '.'))
    if (percentValue != null && !Number.isFinite(percentValue)) {
      setError('Шаг в процентах — число.')
      return
    }
    const percentBps = percentValue == null ? null : Math.round(percentValue * 100)

    if (needsStep && stepMinor == null && percentBps == null) {
      setError('Для редукциона с фиксированным шагом укажите шаг в рублях или процентах.')
      return
    }
    if (stepMinor != null) input.bid_step_minor = stepMinor
    if (percentBps != null) input.bid_step_percent_bps = percentBps

    const minLimit = toMinor(priceMin)
    const maxLimit = toMinor(priceMax)
    if (minLimit != null) input.price_min_limit_minor = minLimit
    if (maxLimit != null) input.price_max_limit_minor = maxLimit
    if (minLimit != null && maxLimit != null && maxLimit < minLimit) {
      setError('Верхний лимит не может быть меньше нижнего.')
      return
    }

    const duration = Number(stepDuration)
    if (Number.isFinite(duration) && duration > 0) input.step_duration_sec = Math.round(duration)
    const extensions = Number(maxExtensions)
    if (Number.isFinite(extensions) && extensions >= 0) input.max_extensions = Math.round(extensions)

    if (scheduledStart.trim() !== '') {
      // datetime-local отдаёт локальное время без зоны — переводим в ISO с зоной.
      const start = new Date(scheduledStart)
      if (Number.isNaN(start.getTime())) {
        setError('Некорректная дата старта.')
        return
      }
      if (start.getTime() <= Date.now()) {
        setError('Дата старта должна быть в будущем.')
        return
      }
      input.scheduled_start_at = start.toISOString()
    }

    try {
      const state = await createMutation.mutateAsync(input)
      onCreated(state.id)
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Создание аукциона: {lotTitle}</CardTitle>
        <p className="text-muted-foreground text-sm">
          Стартовая цена, НДС и базис берутся из лота. Повторный аукцион на тот же лот
          создать нельзя.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Тип аукциона</label>
              <Select value={type} onValueChange={(value) => setType(value as AuctionType)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUCTION_TYPES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {AUCTION_TYPE_LABELS[item]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {type === 'reduction' && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Режим шага</label>
                <Select
                  value={stepMode}
                  onValueChange={(value) => setStepMode(value as StepMode)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STEP_MODES.map((item) => (
                      <SelectItem key={item} value={item}>
                        {STEP_MODE_LABELS[item]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {needsStep && (
              <>
                <div className="space-y-1.5">
                  <label htmlFor="auction-step" className="text-sm font-medium">
                    Шаг, ₽
                  </label>
                  <Input
                    id="auction-step"
                    type="number"
                    min={0}
                    step={0.01}
                    inputMode="decimal"
                    value={stepValue}
                    onChange={(event) => setStepValue(event.target.value)}
                    placeholder="1000"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="auction-step-percent" className="text-sm font-medium">
                    …или шаг, % от старта
                  </label>
                  <Input
                    id="auction-step-percent"
                    type="number"
                    min={0}
                    step={0.01}
                    inputMode="decimal"
                    value={stepPercent}
                    onChange={(event) => setStepPercent(event.target.value)}
                    placeholder="0.5"
                  />
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <label htmlFor="auction-duration" className="text-sm font-medium">
                Длительность шага, сек
              </label>
              <Input
                id="auction-duration"
                type="number"
                min={1}
                value={stepDuration}
                onChange={(event) => setStepDuration(event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="auction-extensions" className="text-sm font-medium">
                Макс. продлений
              </label>
              <Input
                id="auction-extensions"
                type="number"
                min={0}
                value={maxExtensions}
                onChange={(event) => setMaxExtensions(event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="auction-min" className="text-sm font-medium">
                Нижний лимит цены, ₽
              </label>
              <Input
                id="auction-min"
                type="number"
                min={0}
                step={0.01}
                inputMode="decimal"
                value={priceMin}
                onChange={(event) => setPriceMin(event.target.value)}
                placeholder="не задан"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="auction-max" className="text-sm font-medium">
                Верхний лимит цены, ₽
              </label>
              <Input
                id="auction-max"
                type="number"
                min={0}
                step={0.01}
                inputMode="decimal"
                value={priceMax}
                onChange={(event) => setPriceMax(event.target.value)}
                placeholder="не задан"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="auction-start" className="text-sm font-medium">
                Старт (необязательно)
              </label>
              <Input
                id="auction-start"
                type="datetime-local"
                value={scheduledStart}
                onChange={(event) => setScheduledStart(event.target.value)}
              />
            </div>
          </div>

          {error != null && <p className="text-destructive text-sm">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onCancel}>
              Отмена
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Создаём…' : 'Создать аукцион'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

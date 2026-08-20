import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { createTender, publishTender } from '@/api/endpoints'
import type { components } from '@/api/schema'
import { useAuth } from '@/features/auth/AuthContext'
import { CompanyGateBanner } from '@/features/company/CompanyGateBanner'
import { useCompanyGate } from '@/features/company/useCompanyGate'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
  ACCESS_TYPE_LABELS,
  LAW_TYPE_LABELS,
  PROCEDURE_TYPE_LABELS,
  type AccessType,
  type LawType,
  type ProcedureType,
} from '@/lib/enums'

type PriceBasis = components['schemas']['PriceBasis']
type TenderCreate = components['schemas']['TenderCreate']

const CURRENCIES = ['RUB', 'USD', 'EUR'] as const

const PROCEDURE_TYPES = Object.keys(PROCEDURE_TYPE_LABELS) as ProcedureType[]
const LAW_TYPES = Object.keys(LAW_TYPE_LABELS) as LawType[]
const ACCESS_TYPES = Object.keys(ACCESS_TYPE_LABELS) as AccessType[]
const PRICE_BASIS_OPTIONS: ReadonlyArray<{ value: PriceBasis; label: string }> = [
  { value: 'net', label: 'Без НДС' },
  { value: 'gross', label: 'С НДС' },
]

/** Черновик формы тендера (строки — чтобы инпуты не скакали между типами). */
interface TenderForm {
  title: string
  description: string
  procedureType: ProcedureType
  lawType: LawType
  nmckRub: string
  noStartPrice: boolean
  currency: string
  vatRate: string
  priceBasis: PriceBasis
  region: string
  accessType: AccessType
  bidsEnd: string
}

/** Один лот в форме. */
interface LotForm {
  title: string
  priceNetRub: string
  quantity: string
  unit: string
  vatRate: string
  executionStartAt: string
}

const INITIAL_TENDER: TenderForm = {
  title: '',
  description: '',
  procedureType: 'auction',
  lawType: 'commercial',
  nmckRub: '',
  noStartPrice: false,
  currency: 'RUB',
  vatRate: '20',
  priceBasis: 'net',
  region: '',
  accessType: 'open',
  bidsEnd: '',
}

function emptyLot(vatRate: string): LotForm {
  return { title: '', priceNetRub: '', quantity: '1', unit: '', vatRate, executionStartAt: '' }
}

type BuildResult = { input: TenderCreate } | { error: string }

/** Парсинг денег/чисел: запятая → точка, NaN/отрицательное — ошибка. */
function parseNumber(value: string): number | null {
  const parsed = Number(value.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

/** datetime-local → RFC3339 (ISO в UTC). */
function toIso(value: string): string | null {
  if (value === '') return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/**
 * Клиентская валидация + сборка TenderCreate. Лот считается «заполненным», если
 * заполнено любое из его полей; пустые строки игнорируются, заполненные обязаны
 * иметь название и корректную цену (≥ 0).
 */
function buildTenderCreate(form: TenderForm, lots: LotForm[], customerId: string): BuildResult {
  if (form.title.trim() === '') {
    return { error: 'Укажите название тендера' }
  }

  const filledLots = lots.filter((lot) =>
    [lot.title, lot.priceNetRub, lot.quantity, lot.unit, lot.vatRate, lot.executionStartAt].some(
      (value) => value.trim() !== '',
    ),
  )
  if (filledLots.length === 0) {
    return { error: 'Добавьте хотя бы один лот' }
  }
  for (const lot of filledLots) {
    if (lot.title.trim() === '') {
      return { error: 'Укажите название лота' }
    }
    const price = parseNumber(lot.priceNetRub)
    // Number('') === 0, поэтому пустое поле проверяем отдельно: иначе лот
    // уезжает с price_net_minor: 0 и бэкенд отвечает lots_sum_mismatch.
    if (lot.priceNetRub.trim() === '' || price == null || price < 0) {
      return { error: 'Цена лота — число не меньше нуля' }
    }
    if (lot.quantity.trim() !== '') {
      const quantity = parseNumber(lot.quantity)
      if (quantity == null || quantity < 0) {
        return { error: 'Количество лота — число не меньше нуля' }
      }
    }
  }

  let nmckMinor: number | null = null
  if (!form.noStartPrice) {
    const nmck = parseNumber(form.nmckRub)
    if (form.nmckRub.trim() === '' || nmck == null || nmck < 0) {
      return { error: 'Укажите НМЦК (или включите «Без начальной цены»)' }
    }
    nmckMinor = Math.round(nmck * 100)
  }

  const timeline: { [key: string]: string } = {}
  const bidsEndIso = toIso(form.bidsEnd)
  if (bidsEndIso != null) {
    timeline.bids_end = bidsEndIso
  }

  const lotsPayload: components['schemas']['LotCreate'][] = filledLots.map((lot, index) => {
    const price = parseNumber(lot.priceNetRub) ?? 0
    const quantity = lot.quantity.trim() === '' ? undefined : parseNumber(lot.quantity)
    const vatRate = lot.vatRate.trim() === '' ? undefined : parseNumber(lot.vatRate)
    const executionStartAt = toIso(lot.executionStartAt)
    return {
      number: index + 1,
      title: lot.title.trim(),
      price_net_minor: Math.round(price * 100),
      ...(vatRate != null ? { vat_rate: vatRate } : {}),
      ...(quantity != null ? { quantity } : {}),
      ...(lot.unit.trim() !== '' ? { unit: lot.unit.trim() } : {}),
      ...(executionStartAt != null ? { execution_start_at: executionStartAt } : {}),
      trade_end_lead_hours: 0,
    }
  })

  const tenderVat = form.vatRate.trim() === '' ? undefined : parseNumber(form.vatRate)

  return {
    input: {
      title: form.title.trim(),
      ...(form.description.trim() !== '' ? { description: form.description.trim() } : {}),
      procedure_type: form.procedureType,
      law_type: form.lawType,
      nmck_minor: nmckMinor,
      no_start_price: form.noStartPrice,
      currency: form.currency,
      ...(tenderVat != null ? { vat_rate: tenderVat } : {}),
      price_basis: form.priceBasis,
      customer_id: customerId,
      ...(form.region.trim() !== '' ? { region: form.region.trim() } : {}),
      access_type: form.accessType,
      ...(Object.keys(timeline).length > 0 ? { timeline } : {}),
      lots: lotsPayload,
    },
  }
}

/**
 * Создание тендера (/tenders/new):
 * - форма «Основное» + динамический список лотов (min 1);
 * - customer_id из сессии (user.company_id); без компании сабмит заблокирован;
 * - «Сохранить как черновик» → createTender; «Создать и опубликовать» → create + publish;
 * - 422 (напр. lots_sum_mismatch) приходит через apiErrorMessage.
 */
export function TenderCreatePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()

  const [form, setForm] = useState<TenderForm>(INITIAL_TENDER)
  const [lots, setLots] = useState<LotForm[]>(() => [emptyLot(INITIAL_TENDER.vatRate)])
  const [formError, setFormError] = useState<string | null>(null)

  const companyId = user?.company_id ?? null
  const gate = useCompanyGate()

  const mutation = useMutation({
    mutationFn: async ({
      input,
      publish,
    }: {
      input: TenderCreate
      publish: boolean
    }): Promise<{ tender: components['schemas']['Tender']; publishError: string | null }> => {
      const tender = await createTender(input)
      if (tender.id == null) {
        throw new Error('API вернул тендер без id')
      }
      if (!publish) return { tender, publishError: null }
      // Черновик уже создан, и ошибка публикации его не отменяет: провалить всю
      // мутацию значит оставить пользователя на форме, откуда повторная отправка
      // создаст второй черновик. Поэтому уводим в карточку созданного тендера и
      // показываем причину там — публикацию можно повторить оттуда.
      try {
        await publishTender(tender.id)
        return { tender, publishError: null }
      } catch (err) {
        return { tender, publishError: apiErrorMessage(err) }
      }
    },
    onSuccess: ({ tender, publishError }) => {
      void queryClient.invalidateQueries({ queryKey: ['tenders'] })
      navigate(`/tenders/${tender.id}`, publishError != null ? { state: { publishError } } : {})
    },
  })

  function setTender<K extends keyof TenderForm>(key: K, value: TenderForm[K]): void {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function setLot(index: number, key: keyof LotForm, value: string): void {
    setLots((prev) => prev.map((lot, i) => (i === index ? { ...lot, [key]: value } : lot)))
  }

  function addLot(): void {
    setLots((prev) => [...prev, emptyLot(form.vatRate)])
  }

  function removeLot(index: number): void {
    setLots((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev))
  }

  function handleSubmit(publish: boolean): void {
    if (companyId == null) return
    const build = buildTenderCreate(form, lots, companyId)
    if ('error' in build) {
      setFormError(build.error)
      return
    }
    setFormError(null)
    mutation.mutate({ input: build.input, publish })
  }

  // org_pending (FR-1.5.7): пока компания не подтверждена, POST /tenders вернёт
  // 403 — не даём отправить форму и объясняем причину до заполнения полей.
  const submitDisabled = mutation.isPending || companyId == null || !gate.canAct
  const apiError = mutation.isError ? apiErrorMessage(mutation.error) : null

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link to="/tenders">
          <ArrowLeft className="size-4" />
          К списку тендеров
        </Link>
      </Button>

      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Новый тендер</h1>
        <p className="text-muted-foreground text-sm">
          Создайте черновик или сразу опубликуйте. Цены указываются в рублях.
        </p>
      </div>

      <CompanyGateBanner gate={gate} />

      {companyId == null && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10">
          <CardContent className="text-sm">
            Компания не найдена — создайте или подтвердите компанию в профиле, прежде чем
            создавать тендер.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Основное</CardTitle>
          <CardDescription>Общие параметры процедуры закупки.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <label htmlFor="tender-title" className="text-sm font-medium">
              Название *
            </label>
            <Input
              id="tender-title"
              value={form.title}
              onChange={(event) => setTender('title', event.target.value)}
              placeholder="Например: Поставка серверного оборудования"
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <label htmlFor="tender-description" className="text-sm font-medium">
              Описание
            </label>
            <textarea
              id="tender-description"
              value={form.description}
              onChange={(event) => setTender('description', event.target.value)}
              placeholder="Условия поставки, требования к участникам…"
              rows={3}
              className="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex w-full min-w-0 rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] md:text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Тип процедуры</label>
            <Select
              value={form.procedureType}
              onValueChange={(value) => setTender('procedureType', value as ProcedureType)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROCEDURE_TYPES.map((procedureType) => (
                  <SelectItem key={procedureType} value={procedureType}>
                    {PROCEDURE_TYPE_LABELS[procedureType]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Закон</label>
            <Select
              value={form.lawType}
              onValueChange={(value) => setTender('lawType', value as LawType)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LAW_TYPES.map((lawType) => (
                  <SelectItem key={lawType} value={lawType}>
                    {LAW_TYPE_LABELS[lawType]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="tender-nmck" className="text-sm font-medium">
              НМЦК, ₽
            </label>
            <Input
              id="tender-nmck"
              type="number"
              min={0}
              step={0.01}
              inputMode="decimal"
              value={form.nmckRub}
              onChange={(event) => setTender('nmckRub', event.target.value)}
              disabled={form.noStartPrice}
              placeholder="0.00"
            />
          </div>

          <div className="flex items-end gap-2 pb-2">
            <input
              id="tender-no-start-price"
              type="checkbox"
              checked={form.noStartPrice}
              onChange={(event) => setTender('noStartPrice', event.target.checked)}
              className="border-input size-4 rounded accent-primary"
            />
            <label htmlFor="tender-no-start-price" className="text-sm">
              Без начальной цены
            </label>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Валюта</label>
            <Select value={form.currency} onValueChange={(value) => setTender('currency', value)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((currency) => (
                  <SelectItem key={currency} value={currency}>
                    {currency}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="tender-vat" className="text-sm font-medium">
              НДС, %
            </label>
            <Input
              id="tender-vat"
              type="number"
              min={0}
              step={0.1}
              inputMode="decimal"
              value={form.vatRate}
              onChange={(event) => setTender('vatRate', event.target.value)}
              placeholder="20"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">База цены</label>
            <Select
              value={form.priceBasis}
              onValueChange={(value) => setTender('priceBasis', value as PriceBasis)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRICE_BASIS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Доступ</label>
            <Select
              value={form.accessType}
              onValueChange={(value) => setTender('accessType', value as AccessType)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACCESS_TYPES.map((accessType) => (
                  <SelectItem key={accessType} value={accessType}>
                    {ACCESS_TYPE_LABELS[accessType]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="tender-region" className="text-sm font-medium">
              Регион
            </label>
            <Input
              id="tender-region"
              value={form.region}
              onChange={(event) => setTender('region', event.target.value)}
              placeholder="Москва"
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <label htmlFor="tender-bids-end" className="text-sm font-medium">
              Подача заявок до
            </label>
            <Input
              id="tender-bids-end"
              type="datetime-local"
              value={form.bidsEnd}
              onChange={(event) => setTender('bidsEnd', event.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              Время в вашем часовом поясе; API получит момент в UTC (RFC3339).
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Лоты</CardTitle>
            <CardDescription>Минимум один лот с названием и ценой.</CardDescription>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addLot}>
            <Plus className="size-4" />
            Добавить лот
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {lots.map((lot, index) => (
            <div key={index} className="rounded-lg border p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold">Лот {index + 1}</span>
                {lots.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeLot(index)}
                  >
                    <Trash2 className="size-4" />
                    Удалить
                  </Button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <label htmlFor={`lot-${index}-title`} className="text-sm font-medium">
                    Название *
                  </label>
                  <Input
                    id={`lot-${index}-title`}
                    value={lot.title}
                    onChange={(event) => setLot(index, 'title', event.target.value)}
                    placeholder="Наименование товара / работ / услуг"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor={`lot-${index}-price`} className="text-sm font-medium">
                    Цена без НДС, ₽ *
                  </label>
                  <Input
                    id={`lot-${index}-price`}
                    type="number"
                    min={0}
                    step={0.01}
                    inputMode="decimal"
                    value={lot.priceNetRub}
                    onChange={(event) => setLot(index, 'priceNetRub', event.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor={`lot-${index}-quantity`} className="text-sm font-medium">
                    Кол-во
                  </label>
                  <Input
                    id={`lot-${index}-quantity`}
                    type="number"
                    min={0}
                    step={1}
                    inputMode="decimal"
                    value={lot.quantity}
                    onChange={(event) => setLot(index, 'quantity', event.target.value)}
                    placeholder="1"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor={`lot-${index}-unit`} className="text-sm font-medium">
                    Ед. изм.
                  </label>
                  <Input
                    id={`lot-${index}-unit`}
                    value={lot.unit}
                    onChange={(event) => setLot(index, 'unit', event.target.value)}
                    placeholder="шт."
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor={`lot-${index}-vat`} className="text-sm font-medium">
                    НДС, %
                  </label>
                  <Input
                    id={`lot-${index}-vat`}
                    type="number"
                    min={0}
                    step={0.1}
                    inputMode="decimal"
                    value={lot.vatRate}
                    onChange={(event) => setLot(index, 'vatRate', event.target.value)}
                    placeholder="20"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label htmlFor={`lot-${index}-execution`} className="text-sm font-medium">
                    Срок исполнения
                  </label>
                  <Input
                    id={`lot-${index}-execution`}
                    type="datetime-local"
                    value={lot.executionStartAt}
                    onChange={(event) => setLot(index, 'executionStartAt', event.target.value)}
                  />
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {(formError != null || apiError != null) && (
        <p className="text-destructive text-sm">{formError ?? apiError}</p>
      )}

      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={submitDisabled}
          onClick={() => handleSubmit(false)}
        >
          {mutation.isPending ? 'Сохраняем…' : 'Сохранить как черновик'}
        </Button>
        <Button
          type="button"
          disabled={submitDisabled}
          onClick={() => handleSubmit(true)}
        >
          {mutation.isPending ? 'Создаём…' : 'Создать и опубликовать'}
        </Button>
      </div>
    </div>
  )
}
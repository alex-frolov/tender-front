import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createContract,
  listContractTypes,
  type ContractCreate,
  type ContractScope,
  type ContractSource,
} from '@/api/endpoints'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CompanyPicker } from '@/features/company/CompanyPicker'
import { useCompanyQuery } from '@/features/company/useCompany'
import { CONTRACT_SCOPE_LABELS, CONTRACT_SOURCE_LABELS } from '@/lib/contracts'
import { apiErrorMessage } from '@/lib/errors'

const SOURCES: readonly ContractSource[] = ['tender', 'external']
const SCOPES: readonly ContractScope[] = ['single_use', 'multi_use']

/** Рубли из формы → minor units; пустая строка — поле не передаём. */
function toMinor(value: string): number | null {
  if (value.trim() === '') return null
  const parsed = Number(value.replace(',', '.'))
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null
}

/**
 * Создание договора (POST /contracts).
 *
 * Создаёт заказчик (право `contracts.create`), поэтому `customer_id`
 * подставляется его компанией и не редактируется — иначе форма предлагала бы
 * завести договор от чужого имени, который бэкенд всё равно отклонит.
 *
 * Исполнитель выбирается поиском по названию или ИНН (`CompanyPicker`,
 * `GET /companies/search`) — до появления поиска в это поле приходилось
 * вводить uuid, взятый вне интерфейса.
 */
export function ContractCreateForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void
  onCreated: () => void
}) {
  const queryClient = useQueryClient()
  const companyQuery = useCompanyQuery()
  const typesQuery = useQuery({
    queryKey: ['contract-types'],
    queryFn: listContractTypes,
    staleTime: 5 * 60_000,
  })

  const [typeId, setTypeId] = useState('')
  const [source, setSource] = useState<ContractSource>('external')
  const [scope, setScope] = useState<ContractScope>('multi_use')
  const [supplierId, setSupplierId] = useState('')
  const [tenderId, setTenderId] = useState('')
  const [price, setPrice] = useState('')
  const [vatRate, setVatRate] = useState('20')
  const [validFrom, setValidFrom] = useState('')
  const [validTo, setValidTo] = useState('')
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: createContract,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['contracts'] })
    },
  })

  const types = typesQuery.data ?? []
  const customerId = companyQuery.data?.id ?? ''

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setError(null)

    if (typeId === '') {
      setError('Выберите тип договора.')
      return
    }
    if (customerId === '') {
      setError('Компания не определена — создать договор нельзя.')
      return
    }
    if (supplierId.trim() === '') {
      setError('Укажите идентификатор компании-исполнителя.')
      return
    }
    if (source === 'tender' && tenderId.trim() === '') {
      setError('Для договора по итогам процедуры укажите тендер.')
      return
    }

    const input: ContractCreate = {
      contract_type_id: typeId,
      source,
      customer_id: customerId,
      supplier_id: supplierId.trim(),
      scope,
    }
    if (source === 'tender') input.tender_id = tenderId.trim()

    const priceMinor = toMinor(price)
    if (priceMinor != null) input.price_net_minor = priceMinor

    const vat = vatRate.trim() === '' ? null : Number(vatRate.replace(',', '.'))
    if (vat != null && !Number.isFinite(vat)) {
      setError('Ставка НДС — число.')
      return
    }
    if (vat != null) input.vat_rate = vat

    if (validFrom !== '') input.valid_from = validFrom
    if (validTo !== '') input.valid_to = validTo

    try {
      await mutation.mutateAsync(input)
      onCreated()
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Новый договор</CardTitle>
        <CardDescription>
          Договор создаётся в статусе «Черновик»: подписание и регистрация — отдельные шаги.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Тип договора</label>
              <Select value={typeId} onValueChange={setTypeId}>
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={
                      typesQuery.isLoading
                        ? 'Загружаем типы…'
                        : types.length === 0
                          ? 'Типы не заведены'
                          : 'Выберите тип'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {types.map((type) => (
                    <SelectItem key={type.id} value={type.id ?? ''}>
                      {type.name} ({type.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {types.length === 0 && !typesQuery.isLoading && (
                <p className="text-muted-foreground text-xs">
                  Справочник типов ведёт суперадмин площадки в настройках.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Основание</label>
              <Select
                value={source}
                onValueChange={(value) => setSource(value as ContractSource)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOURCES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {CONTRACT_SOURCE_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Область</label>
              <Select value={scope} onValueChange={(value) => setScope(value as ContractScope)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCOPES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {CONTRACT_SCOPE_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                Рамочный договор допускает несколько привязанных процедур.
              </p>
            </div>

            <CompanyPicker
              label="Исполнитель"
              value={supplierId}
              onChange={(companyId) => setSupplierId(companyId)}
              hint="Ищутся подтверждённые компании по названию или ИНН."
            />

            {source === 'tender' && (
              <div className="space-y-1.5">
                <label htmlFor="contract-tender" className="text-sm font-medium">
                  Тендер (id)
                </label>
                <Input
                  id="contract-tender"
                  value={tenderId}
                  onChange={(event) => setTenderId(event.target.value)}
                  placeholder="id выигранной процедуры"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="contract-price" className="text-sm font-medium">
                Цена без НДС, ₽
              </label>
              <Input
                id="contract-price"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                placeholder="100000"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="contract-vat" className="text-sm font-medium">
                Ставка НДС, %
              </label>
              <Input
                id="contract-vat"
                value={vatRate}
                onChange={(event) => setVatRate(event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="contract-from" className="text-sm font-medium">
                Действует с
              </label>
              <Input
                id="contract-from"
                type="date"
                value={validFrom}
                onChange={(event) => setValidFrom(event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="contract-to" className="text-sm font-medium">
                Действует по
              </label>
              <Input
                id="contract-to"
                type="date"
                value={validTo}
                onChange={(event) => setValidTo(event.target.value)}
              />
            </div>
          </div>

          {error != null && <p className="text-destructive text-sm">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onCancel}>
              Отмена
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Создаём…' : 'Создать договор'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

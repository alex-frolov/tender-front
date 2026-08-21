import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createContractType, listContractTypes } from '@/api/endpoints'
import { Badge } from '@/components/ui/badge'
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
import { apiErrorMessage } from '@/lib/errors'

/** Область по умолчанию для нового типа: одна процедура или рамочный. */
const SCOPES = ['single_use', 'multi_use'] as const

const SCOPE_LABELS: Record<(typeof SCOPES)[number], string> = {
  single_use: 'Одна процедура',
  multi_use: 'Рамочный',
}

/**
 * Справочник типов договоров (GET /contract-types, POST /contract-types).
 *
 * Читать каталог может любая роль — он нужен форме создания договора; заводить
 * новые типы разрешено только суперадмину площадки, поэтому карточка живёт на
 * странице настроек площадки.
 *
 * Идентификатор типа числовой (строкой): это общий справочник площадки, а не
 * запись тенанта — отсюда и `code` как человекочитаемый ключ.
 */
export function ContractTypesCard() {
  const queryClient = useQueryClient()
  const typesQuery = useQuery({
    queryKey: ['contract-types'],
    queryFn: listContractTypes,
    staleTime: 5 * 60_000,
  })

  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [scope, setScope] = useState<(typeof SCOPES)[number]>('single_use')
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: createContractType,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['contract-types'] })
    },
  })

  const types = typesQuery.data ?? []

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setError(null)
    if (code.trim() === '' || name.trim() === '') {
      setError('Заполните код и название.')
      return
    }
    try {
      await mutation.mutateAsync({
        code: code.trim(),
        name: name.trim(),
        is_single_use: scope === 'single_use',
      })
      setOpen(false)
      setCode('')
      setName('')
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="text-base">Типы договоров</CardTitle>
          <CardDescription>
            Справочник площадки: из него выбирают тип при создании договора.
          </CardDescription>
        </div>
        {!open && (
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            Добавить тип
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {typesQuery.isLoading ? (
          <p className="text-muted-foreground text-sm">Загружаем справочник…</p>
        ) : typesQuery.isError ? (
          <p className="text-destructive text-sm">
            Не удалось загрузить типы: {apiErrorMessage(typesQuery.error)}
          </p>
        ) : types.length === 0 ? (
          <p className="text-muted-foreground text-sm">Типы не заведены.</p>
        ) : (
          <ul className="divide-y">
            {types.map((type) => (
              <li key={type.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="font-medium">{type.name}</span>
                <span className="text-muted-foreground font-mono text-xs">{type.code}</span>
                <Badge variant="secondary">
                  {type.is_single_use === true ? SCOPE_LABELS.single_use : SCOPE_LABELS.multi_use}
                </Badge>
              </li>
            ))}
          </ul>
        )}

        {open && (
          <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2 border-t pt-3">
            <div className="space-y-1.5">
              <label htmlFor="type-code" className="text-sm font-medium">
                Код
              </label>
              <Input
                id="type-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                maxLength={50}
                placeholder="supply"
                className="w-40"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="type-name" className="text-sm font-medium">
                Название
              </label>
              <Input
                id="type-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={200}
                placeholder="Договор поставки"
                className="w-64"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Область по умолчанию</label>
              <Select
                value={scope}
                onValueChange={(value) => setScope(value as (typeof SCOPES)[number])}
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCOPES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {SCOPE_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" size="sm" disabled={mutation.isPending}>
              {mutation.isPending ? 'Сохраняем…' : 'Создать'}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            {error != null && <p className="text-destructive w-full text-sm">{error}</p>}
          </form>
        )}
      </CardContent>
    </Card>
  )
}

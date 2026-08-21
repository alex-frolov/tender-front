import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createDocumentType,
  deactivateDocumentType,
  listDocumentTypes,
  updateDocumentType,
  type DocumentOwnerRole,
  type DocumentVisibility,
} from '@/api/documents'
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

const OWNER_ROLES: readonly DocumentOwnerRole[] = ['customer', 'executor', 'both']

const OWNER_ROLE_LABELS: Record<DocumentOwnerRole, string> = {
  customer: 'Заказчик',
  executor: 'Исполнитель',
  both: 'Обе стороны',
}

const VISIBILITY_LABELS: Record<DocumentVisibility, string> = {
  public: 'Публичный',
  private: 'Приватный',
}

/**
 * Каталог типов документов (GET/POST /document-types, PUT и DELETE по id).
 *
 * Читают каталог все роли — он нужен форме загрузки, — а ведёт его суперадмин,
 * поэтому карточка живёт в настройках площадки.
 *
 * «Удаление» типа — деактивация: на тип ссылаются уже загруженные документы,
 * поэтому он остаётся в справочнике, но перестаёт предлагаться при загрузке.
 * Обратное включение — тем же PUT с `active: true`.
 */
export function DocumentTypesCard() {
  const queryClient = useQueryClient()
  const typesQuery = useQuery({
    queryKey: ['document-types'],
    queryFn: listDocumentTypes,
    staleTime: 5 * 60_000,
  })

  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [ownerRole, setOwnerRole] = useState<DocumentOwnerRole>('customer')
  const [visibility, setVisibility] = useState<DocumentVisibility>('public')
  const [error, setError] = useState<string | null>(null)

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['document-types'] })
  }

  const createMutation = useMutation({ mutationFn: createDocumentType, onSuccess: invalidate })
  const deactivateMutation = useMutation({
    mutationFn: deactivateDocumentType,
    onSuccess: invalidate,
  })
  const activateMutation = useMutation({
    mutationFn: (id: string) => updateDocumentType(id, { active: true }),
    onSuccess: invalidate,
  })

  const types = typesQuery.data ?? []
  const pending = deactivateMutation.isPending || activateMutation.isPending

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setError(null)
    if (code.trim() === '' || name.trim() === '') {
      setError('Заполните код и название.')
      return
    }
    try {
      await createMutation.mutateAsync({
        code: code.trim(),
        name: name.trim(),
        owner_role: ownerRole,
        visibility,
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
          <CardTitle className="text-base">Типы документов</CardTitle>
          <CardDescription>
            Из этого справочника выбирают тип при загрузке документа к процедуре или договору.
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
            {types.map((type) => {
              const id = type.id != null ? String(type.id) : ''
              const active = type.active !== false
              return (
                <li key={id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <span className="font-medium">{type.name}</span>
                  <span className="text-muted-foreground font-mono text-xs">{type.code}</span>
                  {type.visibility != null && (
                    <Badge variant={type.visibility === 'public' ? 'secondary' : 'warning'}>
                      {VISIBILITY_LABELS[type.visibility]}
                    </Badge>
                  )}
                  {type.required === true && <Badge variant="info">обязательный</Badge>}
                  {type.auto_generated === true && (
                    <Badge variant="neutral">генерируется</Badge>
                  )}
                  {!active && <Badge variant="neutral">отключён</Badge>}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto"
                    disabled={pending || id === ''}
                    onClick={() =>
                      active
                        ? deactivateMutation.mutate(id)
                        : activateMutation.mutate(id)
                    }
                  >
                    {active ? 'Отключить' : 'Включить'}
                  </Button>
                </li>
              )
            })}
          </ul>
        )}

        {open && (
          <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2 border-t pt-3">
            <div className="space-y-1.5">
              <label htmlFor="doc-type-code" className="text-sm font-medium">
                Код
              </label>
              <Input
                id="doc-type-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                maxLength={50}
                placeholder="tech_spec"
                className="w-44"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="doc-type-name" className="text-sm font-medium">
                Название
              </label>
              <Input
                id="doc-type-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={200}
                placeholder="Техническое задание"
                className="w-64"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Кто прикладывает</label>
              <Select
                value={ownerRole}
                onValueChange={(value) => setOwnerRole(value as DocumentOwnerRole)}
              >
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OWNER_ROLES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {OWNER_ROLE_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Видимость по умолчанию</label>
              <Select
                value={visibility}
                onValueChange={(value) => setVisibility(value as DocumentVisibility)}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">{VISIBILITY_LABELS.public}</SelectItem>
                  <SelectItem value="private">{VISIBILITY_LABELS.private}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" size="sm" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Сохраняем…' : 'Создать'}
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

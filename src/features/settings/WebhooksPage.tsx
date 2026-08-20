import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  createWebhook,
  deleteWebhook,
  listWebhooks,
  rotateWebhookSecret,
  updateWebhook,
  type Webhook,
  type WebhookStatus,
} from '@/api/webhooks'
import { apiErrorMessage, isApiError } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'
import { AccessDeniedCard } from './AccessDeniedCard'
import { WebhookDeliveries } from './WebhookDeliveries'

const WEBHOOKS_KEY = ['webhooks'] as const

/** Подписи статуса подписки. */
const STATUS_LABELS: Record<WebhookStatus, string> = {
  active: 'Активна',
  paused: 'На паузе',
}

/**
 * Формат типа события, который принимает бэкенд: `префикс.действие`
 * (WebhookCreateType: Regex `^[a-z]+\.[a-z_]+$`). Закрытого списка событий в
 * контракте нет — подписка принимает любой тип, подходящий под формат, поэтому
 * поле свободное, а не выпадашка.
 */
const EVENT_PATTERN = /^[a-z]+\.[a-z_]+$/

/** Примеры для подсказки — не ограничение, а ориентир по неймингу. */
const EVENT_EXAMPLES = 'tender.published\nauction.bid\nbid.qualified\ncontract.signed'

/** Строки textarea → список типов событий (пустые строки отбрасываются). */
function parseEvents(raw: string): string[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
}

interface WebhookFormState {
  url: string
  events: string
  secret: string
  status: WebhookStatus
}

const EMPTY_FORM: WebhookFormState = { url: '', events: '', secret: '', status: 'active' }

/** Общие поля формы подписки (создание и правка). */
function WebhookFields({
  state,
  onChange,
  idPrefix,
  withSecret,
}: {
  state: WebhookFormState
  onChange: (next: WebhookFormState) => void
  idPrefix: string
  withSecret: boolean
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label htmlFor={`${idPrefix}-url`} className="text-sm font-medium">
          URL получателя
        </label>
        <Input
          id={`${idPrefix}-url`}
          type="url"
          value={state.url}
          onChange={(event) => onChange({ ...state, url: event.target.value })}
          maxLength={2048}
          placeholder="https://example.com/hooks/tender"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor={`${idPrefix}-events`} className="text-sm font-medium">
          События — по одному в строке
        </label>
        <Textarea
          id={`${idPrefix}-events`}
          rows={4}
          value={state.events}
          onChange={(event) => onChange({ ...state, events: event.target.value })}
          placeholder={EVENT_EXAMPLES}
          className="font-mono text-sm"
        />
        <p className="text-muted-foreground text-xs">
          Формат: «префикс.действие», строчными буквами (например, tender.published).
        </p>
      </div>

      {withSecret && (
        <div className="space-y-1.5">
          <label htmlFor={`${idPrefix}-secret`} className="text-sm font-medium">
            Секрет для подписи HMAC-SHA256 (необязательно)
          </label>
          <Input
            id={`${idPrefix}-secret`}
            value={state.secret}
            onChange={(event) => onChange({ ...state, secret: event.target.value })}
            minLength={16}
            maxLength={128}
            placeholder="16–128 символов; пусто — сгенерирует бэкенд"
          />
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          id={`${idPrefix}-active`}
          type="checkbox"
          className="accent-primary size-4"
          checked={state.status === 'active'}
          onChange={(event) =>
            onChange({ ...state, status: event.target.checked ? 'active' : 'paused' })
          }
        />
        <label htmlFor={`${idPrefix}-active`} className="text-sm">
          Подписка активна
        </label>
      </div>
    </div>
  )
}

/**
 * Webhook-подписки компании (WH-1…WH-7, /settings/webhooks).
 *
 * Подписка ловит доменные события своего тенанта и доставляет их POST-запросом
 * на указанный URL с подписью HMAC-SHA256. Доставка асинхронная, с ретраями —
 * поэтому у каждой подписки есть журнал доставок.
 *
 * Доступ — право `webhooks.manage`: admin и platform_admin всегда, остальным
 * его выдаёт суперадмин. Отказ бэкенда (403) показываем явно.
 */
export function WebhooksPage() {
  const queryClient = useQueryClient()

  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState<WebhookFormState>(EMPTY_FORM)
  const [createError, setCreateError] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<WebhookFormState>(EMPTY_FORM)
  const [editError, setEditError] = useState<string | null>(null)

  const [deliveriesId, setDeliveriesId] = useState<string | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)
  // Секрет, показанный один раз (после создания или ротации).
  const [issuedSecret, setIssuedSecret] = useState<string | null>(null)

  const webhooksQuery = useQuery({ queryKey: WEBHOOKS_KEY, queryFn: listWebhooks, retry: false })

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: WEBHOOKS_KEY })
  }

  const createMutation = useMutation({ mutationFn: createWebhook, onSuccess: invalidate })
  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof updateWebhook>[1] }) =>
      updateWebhook(id, input),
    onSuccess: invalidate,
  })
  const deleteMutation = useMutation({ mutationFn: deleteWebhook, onSuccess: invalidate })
  const rotateMutation = useMutation({ mutationFn: rotateWebhookSecret })

  if (
    webhooksQuery.isError
    && isApiError(webhooksQuery.error)
    && webhooksQuery.error.code === 'forbidden'
  ) {
    return (
      <AccessDeniedCard>
        Управление webhook-подписками требует права «webhooks.manage». Оно есть у
        администратора компании и суперадмина площадки.
      </AccessDeniedCard>
    )
  }

  function openCreate(): void {
    setCreateForm(EMPTY_FORM)
    setCreateError(null)
    setEditingId(null)
    setCreateOpen(true)
  }

  function openEdit(webhook: Webhook): void {
    setEditForm({
      url: webhook.url ?? '',
      events: (webhook.events ?? []).join('\n'),
      secret: '',
      status: webhook.status ?? 'active',
    })
    setEditError(null)
    setCreateOpen(false)
    setEditingId(webhook.id ?? null)
  }

  /** Общая валидация формы: URL и хотя бы одно корректное событие. */
  function validate(state: WebhookFormState): { events: string[] } | string {
    if (state.url.trim() === '') return 'Укажите URL получателя.'
    const events = parseEvents(state.events)
    if (events.length === 0) return 'Укажите хотя бы одно событие.'
    const invalid = events.filter((event) => !EVENT_PATTERN.test(event))
    if (invalid.length > 0) {
      return `Неверный формат события: ${invalid.join(', ')}. Ожидается «префикс.действие».`
    }
    return { events }
  }

  async function handleCreate(event: FormEvent): Promise<void> {
    event.preventDefault()
    setCreateError(null)
    const checked = validate(createForm)
    if (typeof checked === 'string') {
      setCreateError(checked)
      return
    }
    try {
      const created = await createMutation.mutateAsync({
        url: createForm.url.trim(),
        events: checked.events,
        status: createForm.status,
        ...(createForm.secret.trim() !== '' ? { secret: createForm.secret.trim() } : {}),
      })
      setCreateOpen(false)
      setCreateForm(EMPTY_FORM)
      setIssuedSecret(created.secret)
    } catch (err) {
      setCreateError(apiErrorMessage(err))
    }
  }

  async function handleEdit(event: FormEvent, id: string): Promise<void> {
    event.preventDefault()
    setEditError(null)
    const checked = validate(editForm)
    if (typeof checked === 'string') {
      setEditError(checked)
      return
    }
    try {
      await updateMutation.mutateAsync({
        id,
        input: { url: editForm.url.trim(), events: checked.events, status: editForm.status },
      })
      setEditingId(null)
    } catch (err) {
      setEditError(apiErrorMessage(err))
    }
  }

  async function handleDelete(webhook: Webhook): Promise<void> {
    if (webhook.id == null) return
    if (!window.confirm(`Удалить подписку на ${webhook.url ?? webhook.id}?`)) return
    setRowError(null)
    try {
      await deleteMutation.mutateAsync(webhook.id)
    } catch (err) {
      setRowError(apiErrorMessage(err))
    }
  }

  async function handleRotate(webhook: Webhook): Promise<void> {
    if (webhook.id == null) return
    if (
      !window.confirm(
        'Ротация секрета: подписи со старым секретом перестанут сходиться у получателя. Продолжить?',
      )
    ) {
      return
    }
    setRowError(null)
    try {
      const rotated = await rotateMutation.mutateAsync(webhook.id)
      setIssuedSecret(rotated.secret)
    } catch (err) {
      setRowError(apiErrorMessage(err))
    }
  }

  const items = webhooksQuery.data ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-muted-foreground max-w-2xl text-sm">
          Подписки на доменные события вашей компании. Каждое событие уходит
          POST-запросом на указанный URL с подписью HMAC-SHA256; неудачные
          доставки повторяются, их видно в журнале.
        </p>
        <Button onClick={openCreate}>Добавить подписку</Button>
      </div>

      {issuedSecret != null && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle className="text-base">Секрет подписи показан один раз</CardTitle>
            <CardDescription>
              Пропишите его у получателя — этим секретом проверяется подпись
              HMAC-SHA256. Повторно он не показывается: узнать его можно только
              новой ротацией, а она обнулит текущий.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <code className="bg-muted block overflow-x-auto rounded-md p-3 font-mono text-sm">
              {issuedSecret}
            </code>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void navigator.clipboard?.writeText(issuedSecret)}
              >
                Скопировать
              </Button>
              <Button onClick={() => setIssuedSecret(null)}>Я сохранил</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {rowError != null && <p className="text-destructive text-sm">{rowError}</p>}

      {createOpen && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Новая подписка</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <WebhookFields
                state={createForm}
                onChange={setCreateForm}
                idPrefix="wh-create"
                withSecret
              />
              {createError != null && <p className="text-destructive text-sm">{createError}</p>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
                  Отмена
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Создаём…' : 'Создать'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {webhooksQuery.isLoading ? (
        <Card>
          <CardContent>
            <p className="text-muted-foreground text-sm">Загружаем подписки…</p>
          </CardContent>
        </Card>
      ) : webhooksQuery.isError ? (
        <Card>
          <CardContent className="space-y-4">
            <p className="text-destructive text-sm">
              Не удалось загрузить подписки: {apiErrorMessage(webhooksQuery.error)}
            </p>
            <Button variant="outline" onClick={() => void webhooksQuery.refetch()}>
              Повторить
            </Button>
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              Подписок пока нет. Добавьте первую — события начнут уходить сразу.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>URL</TableHead>
                  <TableHead>События</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Создана</TableHead>
                  <TableHead className="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((webhook) => {
                  const status = webhook.status ?? 'active'
                  const events = webhook.events ?? []
                  return (
                    <TableRow key={webhook.id}>
                      <TableCell className="max-w-72 truncate font-mono text-xs" title={webhook.url}>
                        {webhook.url || '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {events.map((event) => (
                            <Badge key={event} variant="outline" className="font-mono text-xs">
                              {event}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={status === 'active' ? 'success' : 'neutral'}>
                          {STATUS_LABELS[status]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {webhook.created_at != null ? formatDateTime(webhook.created_at) : '—'}
                      </TableCell>
                      <TableCell className="space-x-2 text-right whitespace-nowrap">
                        <Button variant="outline" size="sm" onClick={() => openEdit(webhook)}>
                          Изменить
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setDeliveriesId((current) =>
                              current === webhook.id ? null : (webhook.id ?? null),
                            )
                          }
                        >
                          Доставки
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={rotateMutation.isPending}
                          onClick={() => void handleRotate(webhook)}
                        >
                          Ротация секрета
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={deleteMutation.isPending}
                          onClick={() => void handleDelete(webhook)}
                        >
                          Удалить
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {editingId != null && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Правка подписки</CardTitle>
            <CardDescription>
              Секрет здесь не меняется — для него отдельное действие «Ротация секрета».
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={(event) => void handleEdit(event, editingId)} className="space-y-4">
              <WebhookFields
                state={editForm}
                onChange={setEditForm}
                idPrefix="wh-edit"
                withSecret={false}
              />
              {editError != null && <p className="text-destructive text-sm">{editError}</p>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setEditingId(null)}>
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

      {deliveriesId != null && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Журнал доставок</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <WebhookDeliveries webhookId={deliveriesId} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

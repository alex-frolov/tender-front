import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import {
  createNotificationSubscription,
  deleteNotificationSubscription,
  listNotificationSubscriptions,
  toggleNotificationSubscription,
} from '@/api/endpoints'
import { Badge } from '@/components/ui/badge'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { apiErrorMessage } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'
import { useAuth } from '@/features/auth/AuthContext'
import {
  NOTIFICATION_CHANNEL_DELIVERED,
  NOTIFICATION_CHANNEL_LABELS,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_EVENT_GROUPS,
  eventLabel,
  isValidEventName,
  notificationChannelHint,
  type NotificationChannel,
} from '@/lib/notifications'

/**
 * Подписки на уведомления (/notifications).
 * - GET /notifications/subscriptions — список;
 * - POST — создание (канал + события + дайджест);
 * - POST .../{id}/toggle — включение/выключение;
 * - DELETE ?subscriptionId= — удаление (идентификатор в query, как в контракте).
 */
export function NotificationsPage() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  const [formOpen, setFormOpen] = useState(false)
  const [channel, setChannel] = useState<NotificationChannel>('email')
  const [selectedEvents, setSelectedEvents] = useState<string[]>([])
  const [customEvents, setCustomEvents] = useState('')
  const [digest, setDigest] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const subscriptionsQuery = useQuery({
    queryKey: ['notification-subscriptions'],
    queryFn: listNotificationSubscriptions,
  })

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['notification-subscriptions'] })
  }

  const createMutation = useMutation({
    mutationFn: createNotificationSubscription,
    onSuccess: invalidate,
  })
  const toggleMutation = useMutation({
    mutationFn: toggleNotificationSubscription,
    onSuccess: invalidate,
  })
  const deleteMutation = useMutation({
    mutationFn: deleteNotificationSubscription,
    onSuccess: invalidate,
  })

  function resetForm(): void {
    setChannel('email')
    setSelectedEvents([])
    setCustomEvents('')
    setDigest(false)
    setFormError(null)
  }

  function toggleEvent(value: string): void {
    setSelectedEvents((current) =>
      current.includes(value)
        ? current.filter((event) => event !== value)
        : [...current, value],
    )
  }

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setFormError(null)

    // Ручные события: через запятую/пробел; формат проверяем до запроса (бэкенд ждёт `префикс.действие`).
    const manual = customEvents
      .split(/[\s,]+/)
      .map((value) => value.trim())
      .filter((value) => value !== '')
    const invalid = manual.filter((value) => !isValidEventName(value))
    if (invalid.length > 0) {
      setFormError(`Неверный формат события: ${invalid.join(', ')} (ожидается «префикс.действие»)`)
      return
    }

    const events = [...new Set([...selectedEvents, ...manual])]
    if (events.length === 0) {
      setFormError('Выберите хотя бы одно событие.')
      return
    }

    try {
      await createMutation.mutateAsync({ channel, events, digest })
      setFormOpen(false)
      resetForm()
    } catch (err) {
      setFormError(apiErrorMessage(err))
    }
  }

  async function handleToggle(subscriptionId: string): Promise<void> {
    setActionError(null)
    try {
      await toggleMutation.mutateAsync(subscriptionId)
    } catch (err) {
      setActionError(apiErrorMessage(err))
    }
  }

  async function handleDelete(subscriptionId: string): Promise<void> {
    if (!window.confirm('Удалить подписку?')) return
    setActionError(null)
    try {
      await deleteMutation.mutateAsync(subscriptionId)
    } catch (err) {
      setActionError(apiErrorMessage(err))
    }
  }

  const subscriptions = subscriptionsQuery.data ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Уведомления</h1>
          <p className="text-muted-foreground text-sm">
            Подписки на события платформы: канал доставки, набор событий, дайджест.
            Письма уходят на адрес вашей учётной записи
            {user?.email != null && user.email !== '' ? ` (${user.email})` : ''}; каналы
            Webhook и Telegram в API пока не доставляются.
          </p>
        </div>
        <Button
          onClick={() => {
            resetForm()
            setFormOpen((open) => !open)
          }}
        >
          <Plus className="size-4" />
          Новая подписка
        </Button>
      </div>

      {formOpen && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Новая подписка</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Канал</label>
                  <Select
                    value={channel}
                    onValueChange={(value) => setChannel(value as NotificationChannel)}
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {NOTIFICATION_CHANNELS.map((item) => (
                        <SelectItem key={item} value={item}>
                          {NOTIFICATION_CHANNEL_LABELS[item]}
                          {!NOTIFICATION_CHANNEL_DELIVERED[item] && ' — не доставляется'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex items-center gap-2 pb-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={digest}
                    onChange={(event) => setDigest(event.target.checked)}
                  />
                  Дайджест (одним письмом)
                </label>
              </div>

              {/* Куда уйдёт уведомление: в подписке нет поля адреса, и это
                  первый вопрос при выборе канала. */}
              <p
                className={
                  NOTIFICATION_CHANNEL_DELIVERED[channel]
                    ? 'text-muted-foreground text-sm'
                    : 'text-sm text-amber-700 dark:text-amber-500'
                }
              >
                {notificationChannelHint(channel, user?.email ?? null)}
              </p>

              <div className="space-y-3">
                <div className="text-sm font-medium">События</div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {NOTIFICATION_EVENT_GROUPS.map((group) => (
                    <div key={group.title} className="space-y-1.5">
                      <div className="text-muted-foreground text-xs font-medium">
                        {group.title}
                      </div>
                      {group.events.map((item) => (
                        <label key={item.value} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="size-4"
                            checked={selectedEvents.includes(item.value)}
                            onChange={() => toggleEvent(item.value)}
                          />
                          {item.label}
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="custom-events" className="text-sm font-medium">
                  Другие события (через запятую)
                </label>
                <Input
                  id="custom-events"
                  value={customEvents}
                  onChange={(event) => setCustomEvents(event.target.value)}
                  placeholder="claim.created, org.verified"
                />
              </div>

              {formError != null && <p className="text-destructive text-sm">{formError}</p>}

              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setFormOpen(false)}>
                  Отмена
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Создаём…' : 'Создать подписку'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {actionError != null && <p className="text-destructive text-sm">{actionError}</p>}

      {subscriptionsQuery.isError ? (
        <Card>
          <CardContent className="space-y-4">
            <p className="text-destructive text-sm">
              Не удалось загрузить подписки: {apiErrorMessage(subscriptionsQuery.error)}
            </p>
            <Button variant="outline" onClick={() => void subscriptionsQuery.refetch()}>
              Повторить
            </Button>
          </CardContent>
        </Card>
      ) : subscriptionsQuery.isLoading ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-muted-foreground text-sm">Загружаем подписки…</p>
          </CardContent>
        </Card>
      ) : subscriptions.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-muted-foreground text-sm">Подписок пока нет</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Канал</TableHead>
                  <TableHead>События</TableHead>
                  <TableHead>Дайджест</TableHead>
                  <TableHead>Состояние</TableHead>
                  <TableHead>Создана</TableHead>
                  <TableHead className="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subscriptions.map((subscription) => {
                  const id = subscription.id ?? ''
                  const events = subscription.events ?? []
                  return (
                    <TableRow key={id}>
                      <TableCell>
                        <Badge variant="secondary">
                          {subscription.channel != null
                            ? NOTIFICATION_CHANNEL_LABELS[subscription.channel]
                            : '—'}
                        </Badge>
                        {/* Подписка «активна», но канал не доставляется — без пометки
                            строка обещает уведомления, которых не будет. */}
                        {subscription.channel != null &&
                          !NOTIFICATION_CHANNEL_DELIVERED[subscription.channel] && (
                            <div className="text-xs text-amber-700 dark:text-amber-500">
                              не доставляется
                            </div>
                          )}
                        {subscription.channel === 'email' && user?.email != null && (
                          <div className="text-muted-foreground text-xs">{user.email}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {events.length === 0 ? (
                            <span className="text-muted-foreground text-xs">—</span>
                          ) : (
                            events.map((event) => (
                              <Badge key={event} variant="neutral" title={eventLabel(event)}>
                                {event}
                              </Badge>
                            ))
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {subscription.digest === true ? 'Да' : 'Нет'}
                      </TableCell>
                      <TableCell>
                        {subscription.active === true ? (
                          <Badge variant="success">Активна</Badge>
                        ) : (
                          <Badge variant="neutral">Выключена</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {subscription.created_at != null
                          ? formatDateTime(subscription.created_at)
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={toggleMutation.isPending}
                            onClick={() => void handleToggle(id)}
                          >
                            {subscription.active === true ? 'Выключить' : 'Включить'}
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={deleteMutation.isPending}
                            onClick={() => void handleDelete(id)}
                          >
                            Удалить
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

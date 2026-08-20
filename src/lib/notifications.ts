import type { components } from '@/api/schema'

/** Канал доставки уведомления (NotificationSubscription.channel). */
export type NotificationChannel = NonNullable<
  components['schemas']['NotificationSubscription']['channel']
>

export const NOTIFICATION_CHANNEL_LABELS: Record<NotificationChannel, string> = {
  email: 'E-mail',
  webhook: 'Webhook',
  telegram: 'Telegram',
}

export const NOTIFICATION_CHANNELS: readonly NotificationChannel[] = [
  'email',
  'webhook',
  'telegram',
]

/**
 * Куда фактически уходит уведомление по каналу.
 *
 * Адрес доставки НЕ является частью подписки: в NotificationSubscriptionCreate
 * нет ни поля e-mail, ни телеграм-ника, ни URL. Единственный работающий канал —
 * `email`, письма уходят на адрес владельца подписки (users.email).
 * Подписки с каналами webhook/telegram сохраняются, но не доставляются:
 * HTTP-доставка — отдельный ресурс POST /webhooks со своим url, транспорта
 * для telegram в API пока нет.
 */
export const NOTIFICATION_CHANNEL_DELIVERED: Record<NotificationChannel, boolean> = {
  email: true,
  webhook: false,
  telegram: false,
}

/**
 * Пояснение к каналу для формы. Для e-mail подставляется адрес текущего
 * пользователя — вопрос «на какой адрес придёт письмо» не должен требовать
 * чтения спеки.
 */
export function notificationChannelHint(
  channel: NotificationChannel,
  userEmail: string | null,
): string {
  switch (channel) {
    case 'email':
      return userEmail != null && userEmail !== ''
        ? `Письма уходят на адрес вашей учётной записи: ${userEmail}. Отдельного поля адреса нет — чтобы сменить получателя, поменяйте email в профиле.`
        : 'Письма уходят на адрес вашей учётной записи (email профиля). Отдельного поля адреса нет.'
    case 'webhook':
      return 'Доставка по этому каналу пока не реализована: подписка сохранится, но сообщения по ней отправляться не будут. HTTP-доставка событий настраивается отдельным ресурсом /webhooks, где указывается URL.'
    case 'telegram':
      return 'Доставка по этому каналу пока не реализована: ни поля для телеграм-ника, ни транспорта в API нет. Подписка сохранится, но сообщения по ней отправляться не будут.'
  }
}

/**
 * Формат имени события на бэкенде — `префикс.действие` (NotificationSubscriptionCreateType:
 * Regex `^[a-z]+\.[a-z_]+$`). Составные имена вроде auction.agreement.requested
 * форму не проходят, поэтому в каталоге их нет.
 */
export const EVENT_PATTERN = /^[a-z]+\.[a-z_]+$/

export function isValidEventName(value: string): boolean {
  return EVENT_PATTERN.test(value)
}

export interface EventGroup {
  title: string
  events: ReadonlyArray<{ value: string; label: string }>
}

/**
 * Каталог событий домена (реестр tender/app/docs/events.md). Список открытый:
 * своё событие можно дописать вручную, если оно проходит EVENT_PATTERN.
 */
export const NOTIFICATION_EVENT_GROUPS: readonly EventGroup[] = [
  {
    title: 'Тендеры',
    events: [
      { value: 'tender.published', label: 'Опубликован' },
      { value: 'tender.withdrawn', label: 'Отозван' },
      { value: 'tender.republished', label: 'Опубликован повторно' },
      { value: 'tender.bids_opened', label: 'Открыт приём заявок' },
      { value: 'tender.opened', label: 'Вскрытие заявок' },
      { value: 'tender.bidding', label: 'Начались торги' },
      { value: 'tender.evaluating', label: 'Рассмотрение заявок' },
      { value: 'tender.awarding', label: 'Определение победителя' },
      { value: 'tender.closed', label: 'Завершён' },
      { value: 'tender.cancelled', label: 'Отменён' },
      { value: 'tender.updated', label: 'Изменён' },
    ],
  },
  {
    title: 'Аукционы',
    events: [
      { value: 'auction.created', label: 'Создан' },
      { value: 'auction.scheduled', label: 'Запланирован' },
      { value: 'auction.started', label: 'Начались торги' },
      { value: 'auction.bid', label: 'Новая ставка' },
      { value: 'auction.finished', label: 'Торги завершены' },
      { value: 'auction.cancelled', label: 'Отменён' },
    ],
  },
  {
    title: 'Заявки',
    events: [
      { value: 'bid.submitted', label: 'Подана' },
      { value: 'bid.withdrawn', label: 'Отозвана' },
      { value: 'bid.qualified', label: 'Допуск/отклонение' },
    ],
  },
  {
    title: 'Контракты',
    events: [
      { value: 'contract.created', label: 'Создан' },
      { value: 'contract.signed', label: 'Подписан' },
      { value: 'contract.registered', label: 'Зарегистрирован' },
      { value: 'contract.terminated', label: 'Расторгнут' },
    ],
  },
  {
    title: 'Исполнение',
    events: [
      { value: 'execution.in_work', label: 'В работе' },
      { value: 'execution.done', label: 'Завершено' },
      { value: 'execution.claim', label: 'Претензия' },
    ],
  },
]

/** Русская подпись события, если оно есть в каталоге; иначе — исходное имя. */
export function eventLabel(value: string): string {
  for (const group of NOTIFICATION_EVENT_GROUPS) {
    const found = group.events.find((event) => event.value === value)
    if (found != null) return `${group.title}: ${found.label}`
  }
  return value
}

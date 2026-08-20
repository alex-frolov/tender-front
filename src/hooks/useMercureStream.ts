import { useEffect, useRef, useState } from 'react'

/**
 * Состояние SSE-подписки. `idle` — подписка выключена (enabled=false или нет
 * discovery): это не ошибка и не «подключаемся», а осознанное отсутствие потока.
 */
export type MercureStreamStatus = 'idle' | 'connecting' | 'open' | 'error'

export interface UseMercureStreamOptions {
  /** URL хаба из discovery (может быть относительным — резолвится от origin). */
  hub: string | null | undefined
  /** Приватные topic'и подписки; пустой список = подключаться незачем. */
  topics: readonly string[]
  /** Subscribe-JWT из discovery (право sub на все topic'и). */
  token: string | null | undefined
  /** Подключаться ли к потоку. */
  enabled?: boolean
  /** Событие хаба: имя (`state`/`bid`/`timer`/`status`) + сырой data. */
  onEvent?: (name: string, data: string) => void
  /** Задержка перед авто-reconnect, мс. */
  reconnectDelayMs?: number
  /** Максимум попыток авто-reconnect до status='error'. */
  maxReconnects?: number
}

export interface MercureStreamResult {
  status: MercureStreamStatus
  /** Имя последнего принятого события ('state' | 'bid' | 'timer' | 'status' | 'error'). */
  lastEvent: string | null
  reconnectCount: number
  errorMessage: string | null
}

/** Имена событий аукциона, на которые подписывается EventSource. */
const EVENT_NAMES = ['state', 'bid', 'timer', 'status'] as const

/**
 * Подписка на Mercure-хаб через EventSource.
 *
 * Токен передаётся query-параметром `authorization`, а НЕ заголовком: нативный
 * EventSource не умеет заголовки (в `EventSourceInit` их просто нет, и хаб
 * получал анонимное подключение — приватные topic'и молчали). Mercure принимает
 * subscribe-JWT в `authorization`; хаб вырезает его из своих логов.
 *
 * Reconnect: при onerror соединение закрывается и переоткрывается через
 * reconnectDelayMs до maxReconnects попыток (счётчик сбрасывается после onopen).
 * Cleanup при размонтировании: es.close() + сброс таймера переподключения.
 */
export function useMercureStream({
  hub,
  topics,
  token,
  enabled = true,
  onEvent,
  reconnectDelayMs = 3000,
  maxReconnects = 5,
}: UseMercureStreamOptions): MercureStreamResult {
  const [status, setStatus] = useState<MercureStreamStatus>('idle')
  const [lastEvent, setLastEvent] = useState<string | null>(null)
  const [reconnectCount, setReconnectCount] = useState(0)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Колбэк и настройки держим в ref — EventSource создаётся один раз на
  // discovery, без пересоздания на каждый рендер страницы.
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent
  const reconnectDelayRef = useRef(reconnectDelayMs)
  reconnectDelayRef.current = reconnectDelayMs
  const maxReconnectsRef = useRef(maxReconnects)
  maxReconnectsRef.current = maxReconnects

  const reconnectTimerRef = useRef<number | null>(null)
  const esRef = useRef<EventSource | null>(null)
  const attemptsRef = useRef(0)

  // Список topic'ов приходит новым массивом на каждый рендер — сравниваем по
  // содержимому, иначе effect пересоздавал бы соединение бесконечно.
  const topicsKey = topics.join('\n')

  useEffect(() => {
    const topicList = topicsKey === '' ? [] : topicsKey.split('\n')

    attemptsRef.current = 0
    setReconnectCount(0)
    setLastEvent(null)
    setErrorMessage(null)

    if (!enabled || hub == null || hub === '' || topicList.length === 0) {
      setStatus('idle')
      return
    }

    let disposed = false

    const closeCurrent = (): void => {
      if (reconnectTimerRef.current != null) {
        window.clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      esRef.current?.close()
      esRef.current = null
    }

    const open = (): void => {
      if (disposed) return
      setStatus('connecting')

      // hub из discovery может быть относительным (/.well-known/mercure) —
      // резолвим относительно origin, абсолютные URL остаются как есть.
      const url = new URL(hub, window.location.origin)
      for (const topic of topicList) {
        url.searchParams.append('topic', topic)
      }
      if (token != null && token !== '') {
        url.searchParams.set('authorization', token)
      }

      const es = new EventSource(url.toString())
      esRef.current = es

      es.onopen = () => {
        if (disposed) return
        attemptsRef.current = 0
        setReconnectCount(0)
        setStatus('open')
      }

      es.onerror = () => {
        if (disposed) return
        closeCurrent()
        const attempts = attemptsRef.current + 1
        if (attempts > maxReconnectsRef.current) {
          setStatus('error')
          setErrorMessage('Не удалось подключиться к потоку аукциона')
          return
        }
        attemptsRef.current = attempts
        setReconnectCount(attempts)
        setLastEvent('error')
        reconnectTimerRef.current = window.setTimeout(open, reconnectDelayRef.current)
      }

      for (const name of EVENT_NAMES) {
        es.addEventListener(name, (event) => {
          setLastEvent(name)
          onEventRef.current?.(name, String((event as MessageEvent).data))
        })
      }
    }

    open()

    return () => {
      disposed = true
      closeCurrent()
    }
  }, [hub, token, topicsKey, enabled])

  return { status, lastEvent, reconnectCount, errorMessage }
}

/** JSON.parse с тихим отказом — полезная нагрузка SSE не обязана быть JSON. */
export function parseStreamJson<T>(data: string): T | null {
  try {
    const parsed: unknown = JSON.parse(data)
    return typeof parsed === 'object' && parsed != null ? (parsed as T) : null
  } catch {
    return null
  }
}

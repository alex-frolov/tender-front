import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getAuctionStream } from '@/api/endpoints'
import type { components } from '@/api/schema'
import { apiErrorMessage } from '@/lib/errors'
import {
  parseStreamJson,
  useMercureStream,
  type MercureStreamStatus,
} from '@/hooks/useMercureStream'

/** Полезная нагрузка ЛЮБОГО события аукциона (`state`/`bid`/`timer`/`status`). */
export type AuctionLiveSnapshot = components['schemas']['AuctionLiveSnapshot']

export type AuctionStreamStatus = MercureStreamStatus

export interface UseAuctionStreamOptions {
  /**
   * Событие хаба: снапшот live-состояния + имя события. Ядро публикует один и
   * тот же снапшот на все типы событий (AuctionStreamPublisher), поэтому
   * отдельных колбэков на `bid`/`timer`/`status` нет — имя события приходит
   * вторым аргументом.
   */
  onSnapshot?: (snapshot: AuctionLiveSnapshot, event: string) => void
  /** Задержка перед авто-reconnect, мс. */
  reconnectDelayMs?: number
  /** Максимум попыток авто-reconnect до status='error'. */
  maxReconnects?: number
  /**
   * Подключаться ли к потоку. false — ни discovery-запроса, ни EventSource:
   * у аукциона вне торговой фазы (завершён/отменён/ещё не запланирован) потока
   * событий нет, и попытка подписки заканчивалась ложным «Не удалось
   * подключиться к потоку аукциона». По умолчанию true.
   */
  enabled?: boolean
}

export interface UseAuctionStreamResult {
  status: AuctionStreamStatus
  /** Имя последнего принятого события ('state' | 'bid' | 'timer' | 'status' | 'error'). */
  lastEvent: string | null
  reconnectCount: number
  errorMessage: string | null
  /** Снапшот из discovery — состояние на момент подключения. */
  initialSnapshot: AuctionLiveSnapshot | undefined
}

/**
 * SSE-подписка на live-события одного аукциона через Mercure-хаб.
 *
 * Флоу: GET /auctions/{id}/stream → AuctionStreamDiscovery { hub, topic, token, state }
 * → EventSource(`${hub}?topic=…&authorization=<subscribe-JWT>`). События по имени
 * (спека): `state`, `bid`, `timer`, `status`; в data — AuctionLiveSnapshot
 * (не полный AuctionState: правила аукциона приходят из /auctions/{id}/state).
 */
export function useAuctionStream(
  auctionId: string,
  options: UseAuctionStreamOptions = {},
): UseAuctionStreamResult {
  const { onSnapshot, reconnectDelayMs, maxReconnects, enabled = true } = options

  const discoveryQuery = useQuery({
    queryKey: ['auction-stream', auctionId],
    queryFn: () => getAuctionStream(auctionId),
    enabled: enabled && auctionId.length > 0,
    staleTime: 30_000,
    retry: 1,
  })

  const discovery = discoveryQuery.data
  const topic = discovery?.topic

  const handleEvent = useCallback(
    (name: string, data: string) => {
      const snapshot = parseStreamJson<AuctionLiveSnapshot>(data)
      if (snapshot == null) return
      onSnapshot?.(snapshot, name)
    },
    [onSnapshot],
  )

  const stream = useMercureStream({
    hub: discovery?.hub,
    topics: topic != null && topic !== '' ? [topic] : [],
    token: discovery?.token,
    enabled: enabled && discovery != null,
    onEvent: handleEvent,
    reconnectDelayMs,
    maxReconnects,
  })

  if (!enabled) {
    return {
      status: 'idle',
      lastEvent: null,
      reconnectCount: 0,
      errorMessage: null,
      initialSnapshot: undefined,
    }
  }

  // Discovery не ответил — потока не будет вовсе: показываем это ошибкой
  // подписки, а не «подключаемся» до бесконечности.
  if (discoveryQuery.isError) {
    return {
      status: 'error',
      lastEvent: null,
      reconnectCount: 0,
      errorMessage: apiErrorMessage(discoveryQuery.error),
      initialSnapshot: undefined,
    }
  }

  // Discovery ещё в пути — соединения нет, но и «потока не нужно» тоже:
  // честное состояние здесь «подключаемся».
  if (discovery == null) {
    return {
      status: 'connecting',
      lastEvent: null,
      reconnectCount: 0,
      errorMessage: null,
      initialSnapshot: undefined,
    }
  }

  return { ...stream, initialSnapshot: discovery.state }
}

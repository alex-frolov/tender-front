import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getAuctionsStream } from '@/api/endpoints'
import { apiErrorMessage } from '@/lib/errors'
import type { AuctionLiveSnapshot, UseAuctionStreamResult } from '@/hooks/useAuctionStream'
import { parseStreamJson, useMercureStream } from '@/hooks/useMercureStream'

export interface UseAuctionsStreamOptions {
  /** Событие хаба: снапшот (в нём `auction_id` — чью строку обновлять). */
  onSnapshot?: (snapshot: AuctionLiveSnapshot, event: string) => void
  /** Подключаться ли к потоку (например, только когда в списке есть живые торги). */
  enabled?: boolean
}

export type UseAuctionsStreamResult = Omit<UseAuctionStreamResult, 'initialSnapshot'> & {
  /** Сколько аукционов реально слушаем (topics из discovery). */
  topicsCount: number
}

/**
 * SSE-подписка на ВСЕ живые аукционы компании одним соединением.
 *
 * Флоу: GET /auctions/stream → AuctionsStreamDiscovery { hub, topics, token }
 * → один EventSource со всеми topic'ами. По одному EventSource на строку
 * списка идти нельзя: браузер держит ~6 SSE-соединений на origin, а торгов
 * у компании бывает больше — часть строк просто не обновлялась бы.
 *
 * Пустой `topics` (живых торгов нет) — status='idle': подключаться незачем.
 */
export function useAuctionsStream(
  options: UseAuctionsStreamOptions = {},
): UseAuctionsStreamResult {
  const { onSnapshot, enabled = true } = options

  const discoveryQuery = useQuery({
    queryKey: ['auctions-stream'],
    queryFn: getAuctionsStream,
    enabled,
    staleTime: 30_000,
    retry: 1,
  })

  const discovery = discoveryQuery.data
  const topics = discovery?.topics ?? []

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
    topics,
    token: discovery?.token,
    enabled: enabled && discovery != null,
    onEvent: handleEvent,
  })

  if (!enabled) {
    return { status: 'idle', lastEvent: null, reconnectCount: 0, errorMessage: null, topicsCount: 0 }
  }

  if (discoveryQuery.isError) {
    return {
      status: 'error',
      lastEvent: null,
      reconnectCount: 0,
      errorMessage: apiErrorMessage(discoveryQuery.error),
      topicsCount: 0,
    }
  }

  if (discovery == null) {
    return {
      status: 'connecting',
      lastEvent: null,
      reconnectCount: 0,
      errorMessage: null,
      topicsCount: 0,
    }
  }

  return { ...stream, topicsCount: topics.length }
}

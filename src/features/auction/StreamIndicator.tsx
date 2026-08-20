import { Badge } from '@/components/ui/badge'
import type { MercureStreamStatus } from '@/hooks/useMercureStream'

interface StreamIndicatorProps {
  status: MercureStreamStatus
  reconnectCount: number
  error: string | null
  /** Подпись для status='idle' — почему потока нет именно на этой странице. */
  idleLabel?: string
}

/**
 * Индикатор состояния SSE-подписки: подключено / переподключение / ошибка.
 * `idle` — подписки нет по решению страницы (нет живых торгов): это норма,
 * а не сбой связи, поэтому нейтральный бейдж, а не красный.
 */
export function StreamIndicator({
  status,
  reconnectCount,
  error,
  idleLabel = 'Live-обновления не нужны',
}: StreamIndicatorProps) {
  if (status === 'idle') {
    return <Badge variant="neutral">{idleLabel}</Badge>
  }
  if (status === 'error') {
    return <Badge variant="danger">{error ?? 'Нет связи с потоком'}</Badge>
  }
  if (status === 'open') {
    return <Badge variant="success">Подключено</Badge>
  }
  return (
    <Badge variant="warning">
      {reconnectCount > 0 ? `Переподключение… (попытка ${reconnectCount})` : 'Подключение…'}
    </Badge>
  )
}

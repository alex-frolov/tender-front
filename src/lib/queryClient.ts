import { QueryClient } from '@tanstack/react-query'
import { isRetryableError } from '@/lib/errors'

/** Сколько раз повторять запрос после первой неудачи. */
const MAX_QUERY_RETRIES = 2

/**
 * Повторять только то, что может пройти со второго раза: сеть и 5xx.
 *
 * Дефолт React Query — три повтора любой ошибки с нарастающей паузой. Для
 * штатного 403 у настраиваемых прав (дашборд, вопросы, документы) это значило
 * три лишних запроса и ~7 секунд до пояснения «нет доступа».
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  return failureCount < MAX_QUERY_RETRIES && isRetryableError(error)
}

/**
 * Мутации по умолчанию не повторяются: повтор неидемпотентного POST может
 * создать дубль. Исключение — мутации с Idempotency-Key (useIdempotentMutation),
 * они включают ретрай сами.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: shouldRetryQuery },
      mutations: { retry: false },
    },
  })
}

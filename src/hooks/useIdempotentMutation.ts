import { useCallback, useRef } from 'react'
import {
  useMutation,
  type MutateOptions,
  type UseMutationOptions,
  type UseMutationResult,
} from '@tanstack/react-query'
import { isRetryableError } from '@/lib/errors'

/** Повторы после первой неудачи: сеть и 5xx, с тем же ключом. */
const MAX_IDEMPOTENT_RETRIES = 2

/**
 * Обёртка над useMutation, которая автоматически генерирует Idempotency-Key
 * (crypto.randomUUID()) на каждое действие пользователя (mutate/mutateAsync).
 *
 * Ключ пересоздаётся один раз на логическое действие (при вызове mutate),
 * а повторы mutationFn (retry React Query) переиспользуют тот же ключ.
 * Поэтому повторная отправка той же ставки (двойной клик / retry) не создаёт
 * дублей: API возвращает тот же результат (см. спеку, Idempotency-Key).
 *
 * Ради этого ретрай здесь включён по умолчанию — в отличие от остальных
 * мутаций (lib/queryClient.ts): ставка, отправленная в момент обрыва связи,
 * уходит повторно, а не теряется. 4xx не повторяются — это ответ по существу.
 */
export function useIdempotentMutation<TData, TError, TVariables>(
  options: Omit<UseMutationOptions<TData, TError, TVariables>, 'mutationFn'> & {
    mutationFn: (variables: TVariables, idempotencyKey: string) => Promise<TData>
  },
): UseMutationResult<TData, TError, TVariables> {
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID())
  const { mutationFn, ...rest } = options

  const mutation = useMutation({
    retry: (failureCount, error) =>
      failureCount < MAX_IDEMPOTENT_RETRIES && isRetryableError(error),
    ...rest,
    mutationFn: (variables) => mutationFn(variables, idempotencyKeyRef.current),
  })
  const { mutate: baseMutate, mutateAsync: baseMutateAsync } = mutation

  const mutate = useCallback(
    (variables: TVariables, mutateOptions?: MutateOptions<TData, TError, TVariables>) => {
      // Новый ключ на каждое пользовательское действие; retry его переиспользует.
      idempotencyKeyRef.current = crypto.randomUUID()
      baseMutate(variables, mutateOptions)
    },
    [baseMutate],
  )

  const mutateAsync = useCallback(
    (variables: TVariables, mutateOptions?: MutateOptions<TData, TError, TVariables>) => {
      idempotencyKeyRef.current = crypto.randomUUID()
      return baseMutateAsync(variables, mutateOptions)
    },
    [baseMutateAsync],
  )

  return { ...mutation, mutate, mutateAsync }
}

import { useCallback, useRef } from 'react'
import {
  useMutation,
  type MutateOptions,
  type UseMutationOptions,
  type UseMutationResult,
} from '@tanstack/react-query'

/**
 * Обёртка над useMutation, которая автоматически генерирует Idempotency-Key
 * (crypto.randomUUID()) на каждое действие пользователя (mutate/mutateAsync).
 *
 * Ключ пересоздаётся один раз на логическое действие (при вызове mutate),
 * а повторы mutationFn (retry React Query) переиспользуют тот же ключ.
 * Поэтому повторная отправка той же ставки (двойной клик / retry) не создаёт
 * дублей: API возвращает тот же результат (см. спеку, Idempotency-Key).
 */
export function useIdempotentMutation<
  TData,
  TError,
  TVariables,
>(
  options: Omit<UseMutationOptions<TData, TError, TVariables>, 'mutationFn'> & {
    mutationFn: (variables: TVariables, idempotencyKey: string) => Promise<TData>
  },
): UseMutationResult<TData, TError, TVariables> {
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID())
  const { mutationFn, ...rest } = options

  const mutation = useMutation({
    ...rest,
    mutationFn: (variables) => mutationFn(variables, idempotencyKeyRef.current),
  })

  const mutate = useCallback(
    (
      variables: TVariables,
      mutateOptions?: MutateOptions<TData, TError, TVariables>,
    ) => {
      // Новый ключ на каждое пользовательское действие; retry его переиспользует.
      idempotencyKeyRef.current = crypto.randomUUID()
      return mutation.mutate(variables, mutateOptions)
    },
    [mutation.mutate],
  )

  const mutateAsync = useCallback(
    async (
      variables: TVariables,
      mutateOptions?: MutateOptions<TData, TError, TVariables>,
    ) => {
      idempotencyKeyRef.current = crypto.randomUUID()
      return mutation.mutateAsync(variables, mutateOptions)
    },
    [mutation.mutateAsync],
  )

  return {
    ...mutation,
    mutate,
    mutateAsync,
  }
}
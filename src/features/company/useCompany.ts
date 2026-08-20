import { useQuery } from '@tanstack/react-query'
import { getMe } from '@/api/auth'
import type { components } from '@/api/schema'

export type Company = components['schemas']['Company']

/** Ключ кэша компании актора — инвалидируется после PATCH /companies. */
export const COMPANY_QUERY_KEY = ['company'] as const

/**
 * Компания текущего пользователя. Отдельного GET /companies/{id} в контракте нет,
 * поэтому источник — GET /users/me (возвращает user + company).
 */
export function useCompanyQuery() {
  return useQuery({
    queryKey: COMPANY_QUERY_KEY,
    queryFn: async (): Promise<Company | null> => {
      const me = await getMe()
      return me.company ?? null
    },
    staleTime: 60_000,
  })
}

import { useQuery } from '@tanstack/react-query'
import { getMyCompany } from '@/api/endpoints'
import type { components } from '@/api/schema'
import { queryKeys } from '@/api/queryKeys'
import { useAuth } from '@/features/auth/useAuth'

export type Company = components['schemas']['Company']

/**
 * Компания текущего пользователя — GET /companies: карточка своей компании
 * целиком, доступна любой роли (минимальная — agent). Раньше источником был
 * GET /users/me, который отдаёт ту же компанию вложенным полем; отдельный
 * эндпоинт даёт её же, но обновляется независимо от профиля.
 *
 * У сотрудника без компании (платформенный админ) эндпоинт отвечает ошибкой —
 * такой запрос заведомо бессмысленный, поэтому он просто не отправляется,
 * а данными остаётся null: «компании нет» — это не сбой загрузки.
 */
export function useCompanyQuery() {
  const { user } = useAuth()
  const hasCompany = user?.company_id != null

  return useQuery({
    queryKey: queryKeys.company,
    queryFn: async (): Promise<Company | null> => await getMyCompany(),
    enabled: hasCompany,
    staleTime: 60_000,
  })
}

import type { ApiKeyScope } from '@/api/apiKeys'

/**
 * Русские подписи scopes API-ключа.
 *
 * Каталог закрытый (`ApiKeyScope` в схеме), поэтому мапа объявлена как
 * Record<ApiKeyScope, string>: при появлении нового scope в контракте
 * компилятор укажет на неполный словарь.
 */
export const API_KEY_SCOPE_LABELS: Record<ApiKeyScope, string> = {
  'api:all': 'Полный доступ владельца',
  'api:profile': 'Профиль',
  'api:tenders:read': 'Тендеры: чтение',
  'api:tenders:write': 'Тендеры: изменение',
  'api:tenders:docs': 'Тендеры: документы',
  'api:tenders:qa': 'Тендеры: вопросы и ответы',
  'api:tenders:rate': 'Тендеры: оценка исполнения',
  'api:bids:prepare': 'Заявки: подготовка',
  'api:bids:write': 'Заявки: подача и отзыв',
  'api:bids:qualify': 'Заявки: допуск и отклонение',
  'api:auctions:bid': 'Аукционы: ставки',
  'api:auctions:control': 'Аукционы: управление торгами',
  'api:contracts:write': 'Контракты: изменение',
  'api:claims:write': 'Претензии: изменение',
  'api:execution:write': 'Исполнение: изменение',
  'api:analytics:read': 'Аналитика: чтение',
  'api:exports:export': 'Экспорт данных',
  'api:webhooks:manage': 'Webhooks: управление',
  'api:keys:manage': 'API-ключи: управление',
  'api:users:manage': 'Пользователи: управление',
  'api:platform:admin': 'Администрирование площадки',
}

/** Порядок вывода в форме: сначала полный доступ, дальше — по каталогу. */
export const API_KEY_SCOPES = Object.keys(API_KEY_SCOPE_LABELS) as ApiKeyScope[]

import type { components } from '@/api/schema'

/** Тело ошибки по спеке: `title` всегда, `code` и `detail` — почти всегда. */
type ProblemBody = components['schemas']['Error']

/**
 * Ошибка API — единственный тип, который бросают обёртки из `src/api/`.
 *
 * Зачем свой класс, а не тело ответа как есть: openapi-fetch кладёт в `error`
 * разобранный JSON и HTTP-статус туда не добавляет — в теле его нет (схема
 * `Error`: `title`, `code`, `detail`; `status` дублируется только у 429). Статус
 * берём из `Response`. Ответы, не дошедшие до приложения (прокси, неизвестный
 * маршрут), приходят без `code` — его заменяет `http_<status>`, чтобы проверки
 * по коду не падали на `undefined`.
 */
export class ApiError extends Error {
  readonly status: number
  /** Код из реестра ErrorCode; `http_<status>`, если сервер его не прислал. */
  readonly code: string
  readonly title: string | undefined
  readonly detail: string | undefined
  /** Retry-After в секундах (429 rate_limited), если сервер его прислал. */
  readonly retryAfter: number | undefined

  constructor(init: {
    status: number
    code?: string
    title?: string
    detail?: string
    retryAfter?: number
  }) {
    const code = init.code ?? `http_${init.status}`
    super(init.detail ?? init.title ?? code)
    this.name = 'ApiError'
    this.status = init.status
    this.code = code
    this.title = init.title
    this.detail = init.detail
    this.retryAfter = init.retryAfter
  }
}

function stringField(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key]
  return typeof value === 'string' && value !== '' ? value : undefined
}

/** Retry-After: заголовок, иначе `retry_after` из тела 429 (то же значение). */
function parseRetryAfter(
  response: Response | undefined,
  body: Record<string, unknown> | null,
): number | undefined {
  const raw = response?.headers.get('Retry-After') ?? body?.retry_after
  if (raw == null || raw === '') return undefined
  const seconds = Number(raw)
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined
}

/**
 * Ошибка API из ответа openapi-fetch. Тело может быть чем угодно: JSON по
 * RFC 9457, строкой (HTML 502 от прокси) или пустым.
 */
export function toApiError(body: unknown, response: Response | undefined): ApiError {
  const status = response?.status ?? 0
  if (typeof body !== 'object' || body === null) {
    return new ApiError({ status, retryAfter: parseRetryAfter(response, null) })
  }
  // Поля читаем по одному и с проверкой типа: тело пришло из сети, а не из схемы.
  const record = body as Partial<Record<keyof ProblemBody, unknown>> & Record<string, unknown>
  return new ApiError({
    status,
    code: stringField(record, 'code'),
    title: stringField(record, 'title'),
    detail: stringField(record, 'detail'),
    retryAfter: parseRetryAfter(response, record),
  })
}

/**
 * Ответа нет вовсе: сеть, упавший прокси, отключённый Wi-Fi. Бросает обёртка
 * над fetch в `api/client.ts` — сам fetch в этом случае даёт безымянный
 * TypeError, неотличимый от программной ошибки.
 */
export class NetworkError extends Error {
  constructor(cause: unknown) {
    super('Нет связи с сервером — проверьте подключение', { cause })
    this.name = 'NetworkError'
  }
}

/** Проверка, что брошенное значение — ошибка API. */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

/** Ошибка API с конкретным кодом из реестра (`forbidden`, `not_found`, ...). */
export function isApiErrorCode(error: unknown, code: string): error is ApiError {
  return isApiError(error) && error.code === code
}

/**
 * Сбой, который имеет смысл повторить: сеть (ответа нет) или 5xx. 4xx — ответ по существу: повтор вернёт то же самое, только позже.
 */
export function isRetryableError(error: unknown): boolean {
  if (isApiError(error)) return error.status >= 500
  return error instanceof NetworkError
}

/**
 * POST /auth/token: пароль верен, но нужен (или не подошёл) TOTP-код —
 * код two_factor_required из реестра ErrorCode.
 */
export function isTotpRequired(error: unknown): boolean {
  return isApiErrorCode(error, 'two_factor_required')
}

/**
 * Русские пояснения к кодам реестра ErrorCode (public/openapi.yaml бэкенда;
 * там же тест, что реестр совпадает с кодами, которые API реально шлёт). Тексты API — английские
 * (`title`/`detail`), а UI русский: для кодов, которые пользователь реально
 * видит, показываем осмысленную формулировку, а технический detail оставляем
 * в скобках — в нём бывают числа (например, суммы в lots_sum_mismatch).
 */
const ERROR_CODE_MESSAGES: Record<string, string> = {
  org_pending:
    'Компания не подтверждена администратором платформы — создание и публикация тендеров недоступны',
  invalid_credentials: 'Неверный email или пароль',
  forbidden: 'Недостаточно прав для этого действия',
  document_forbidden: 'Это закрытый документ другой компании',
  not_found: 'Объект не найден',
  validation_error: 'Проверьте заполнение полей',
  lots_sum_mismatch: 'Сумма лотов не совпадает с НМЦК тендера',
  state_transition_forbidden: 'Действие недоступно в текущем статусе',
  conflict: 'Действие конфликтует с текущим состоянием',
  auction_not_trade: 'Аукцион не в фазе торгов — ставки не принимаются',
  auction_window_closed: 'Время торгов истекло — ставки больше не принимаются',
  // Один код на все отказы доменной проверки ставки: и цена вне шага/лимитов,
  // и отсутствие допуска к торгам. Что именно — в detail, он идёт в скобках.
  bid_rejected: 'Ставка отклонена: проверьте допуск к торгам, шаг и лимиты цены',
  duplicate_bid: 'В этом окне торгов ваше ценовое предложение уже принято',
  no_winner: 'Нет принятых ставок — выбрать победителя не из чего',
  wrong_auction_type: 'Автовыбор победителя доступен только для редукциона',
  invalid_winner_bid: 'Эта ставка не входит в принятые предложения аукциона',
  rate_limited: 'Слишком много запросов — попробуйте чуть позже',
  idempotency_conflict: 'Повторный запрос с тем же ключом, но другими данными',
  access_denied: 'Закрытый тендер: нужен действующий рамочный контракт',
  contract_required: 'Для завершения нужен действующий контракт',
  rating_not_allowed: 'Оценку можно поставить только после завершения',
  duplicate_favorite: 'Тендер уже в избранном',
  last_active_admin: 'Нельзя удалить или понизить последнего администратора компании',
  export_not_ready: 'Файл выгрузки ещё готовится',
}

/** Человекочитаемое сообщение об ошибке для UI. */
export function apiErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    const known = ERROR_CODE_MESSAGES[error.code]
    if (known != null) {
      return error.detail ? `${known} (${error.detail})` : known
    }
    if (error.detail) return error.detail
    if (error.title) return error.title
    if (error.status >= 500) return `Сервер не смог обработать запрос (HTTP ${error.status})`
    return `Ошибка API (${error.code})`
  }
  if (error instanceof Error) return error.message
  return 'Неизвестная ошибка'
}

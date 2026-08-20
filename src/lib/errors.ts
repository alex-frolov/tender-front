import type { components } from '@/api/schema'

type ApiError = components['schemas']['Error']

/** Проверка, что брошенное значение — ошибка API (RFC 9457). */
export function isApiError(error: unknown): error is ApiError {
  if (typeof error !== 'object' || error === null) {
    return false
  }
  const maybe = error as Partial<ApiError>
  // Поле status может отсутствовать в рантайме: openapi-fetch парсит JSON тела
  // ошибки как есть и НЕ добавляет HTTP-статус в объект error. Надёжный признак
  // ошибки этого API — строковый code (title/detail могут быть пустыми).
  return typeof maybe.code === 'string'
}

/** Коды из реестра ErrorCode: требуется второй фактор (TOTP). */
const TOTP_CODES = new Set(['two_factor_required', 'totp_required'])

/**
 * Сервер сигналит о необходимости TOTP-кода. Точная проверка по коду
 * из реестра ErrorCode (основной — two_factor_required, totp_required
 * оставлен для совместимости со старыми серверами).
 */
export function isTotpRequired(error: unknown): boolean {
  return isApiError(error) && TOTP_CODES.has(error.code)
}

/**
 * Русские пояснения к кодам реестра ErrorCode. Тексты API — английские
 * (`title`/`detail`), а UI русский: для кодов, которые пользователь реально
 * видит, показываем осмысленную формулировку, а технический detail оставляем
 * в скобках — в нём бывают числа (например, суммы в lots_sum_mismatch).
 */
const ERROR_CODE_MESSAGES: Record<string, string> = {
  org_pending:
    'Компания не подтверждена администратором платформы — создание и публикация тендеров недоступны',
  email_not_verified: 'Подтвердите email — до этого доступен только просмотр',
  forbidden: 'Недостаточно прав для этого действия',
  not_found: 'Объект не найден',
  validation_error: 'Проверьте заполнение полей',
  lots_sum_mismatch: 'Сумма лотов не совпадает с НМЦК тендера',
  state_transition_forbidden: 'Действие недоступно в текущем статусе',
  auction_not_trade: 'Аукцион не в фазе торгов — ставки не принимаются',
  // Один код на все отказы доменной проверки ставки: и цена вне шага/лимитов,
  // и отсутствие допуска к торгам. Что именно — в detail, он идёт в скобках.
  bid_rejected: 'Ставка отклонена: проверьте допуск к торгам, шаг и лимиты цены',
  duplicate_bid: 'Такая ставка уже принята',
  rate_limited: 'Слишком много запросов — попробуйте чуть позже',
  idempotency_conflict: 'Повторный запрос с тем же ключом, но другими данными',
  access_denied: 'Закрытый тендер: нужен действующий рамочный контракт',
  contract_required: 'Для завершения нужен действующий контракт',
  cancel_reason_required: 'Укажите причину отмены',
  other_reason_required: 'Для причины «Другое» нужен текст',
  rating_not_allowed: 'Оценку можно поставить только после завершения',
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
    return `Ошибка API (${error.code})`
  }
  if (error instanceof Error) return error.message
  return 'Неизвестная ошибка'
}
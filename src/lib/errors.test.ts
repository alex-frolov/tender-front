import { describe, expect, it } from 'vitest'
import {
  ApiError,
  NetworkError,
  apiErrorMessage,
  isApiErrorCode,
  isRetryableError,
  isTotpRequired,
  toApiError,
} from './errors'

const response = (status: number, headers: Record<string, string> = {}) =>
  new Response(null, { status, headers })

describe('toApiError', () => {
  it('берёт статус из ответа, а поля — из тела RFC 9457', () => {
    const error = toApiError(
      { title: 'Not Found', detail: 'Tender not found', code: 'not_found' },
      response(404),
    )
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toBeInstanceOf(Error)
    expect(error.status).toBe(404)
    expect(error.code).toBe('not_found')
    expect(error.detail).toBe('Tender not found')
    expect(error.message).toBe('Tender not found')
  })

  it('без code в теле (ответ не от приложения) подставляет http_<status>', () => {
    const error = toApiError({ title: 'Validation error', detail: 'limit: …' }, response(400))
    expect(error.code).toBe('http_400')
    expect(apiErrorMessage(error)).toBe('limit: …')
  })

  it('переживает тело-строку (HTML 502 от прокси)', () => {
    const error = toApiError('<html>Bad Gateway</html>', response(502))
    expect(error.status).toBe(502)
    expect(error.code).toBe('http_502')
    expect(apiErrorMessage(error)).toBe('Сервер не смог обработать запрос (HTTP 502)')
  })

  it('читает Retry-After', () => {
    const error = toApiError({ code: 'rate_limited' }, response(429, { 'Retry-After': '30' }))
    expect(error.retryAfter).toBe(30)
  })

  it('берёт retry_after из тела 429, если заголовка нет', () => {
    const error = toApiError(
      { title: 'Too Many Requests', code: 'rate_limited', status: 429, retry_after: 42 },
      response(429),
    )
    expect(error.retryAfter).toBe(42)
  })

  it('validation_error переводится и сохраняет detail', () => {
    const error = toApiError(
      { title: 'Validation error', code: 'validation_error', detail: 'inn: This value is not valid.' },
      response(422),
    )
    expect(apiErrorMessage(error)).toBe('Проверьте заполнение полей (inn: This value is not valid.)')
  })
})

describe('isRetryableError', () => {
  it.each([
    [new NetworkError(new TypeError('Failed to fetch')), true],
    [new ApiError({ status: 503 }), true],
    [new ApiError({ status: 403, code: 'forbidden' }), false],
    [new ApiError({ status: 404, code: 'not_found' }), false],
    [new ApiError({ status: 429, code: 'rate_limited' }), false],
    [new TypeError('x is undefined'), false],
  ])('%o → %s', (error, expected) => {
    expect(isRetryableError(error)).toBe(expected)
  })
})

describe('apiErrorMessage', () => {
  it('переводит известный код и оставляет detail в скобках', () => {
    const error = new ApiError({ status: 409, code: 'bid_rejected', detail: 'Only admitted' })
    expect(apiErrorMessage(error)).toBe(
      'Ставка отклонена: проверьте допуск к торгам, шаг и лимиты цены (Only admitted)',
    )
  })

  it('объясняет отсутствие связи', () => {
    expect(apiErrorMessage(new NetworkError(new TypeError()))).toMatch(/Нет связи/)
  })
})

describe('проверки кода', () => {
  it('isApiErrorCode и isTotpRequired работают только с ApiError', () => {
    const totp = new ApiError({ status: 401, code: 'two_factor_required' })
    expect(isTotpRequired(totp)).toBe(true)
    expect(isTotpRequired(new ApiError({ status: 401, code: 'invalid_credentials' }))).toBe(false)
    expect(isTotpRequired({ code: 'two_factor_required' })).toBe(false)
    expect(isApiErrorCode(new ApiError({ status: 403, code: 'forbidden' }), 'forbidden')).toBe(true)
  })
})

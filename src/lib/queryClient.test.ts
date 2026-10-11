import { describe, expect, it } from 'vitest'
import { ApiError, NetworkError } from './errors'
import { shouldRetryQuery } from './queryClient'

describe('shouldRetryQuery', () => {
  it('не повторяет штатные отказы 4xx', () => {
    expect(shouldRetryQuery(0, new ApiError({ status: 403, code: 'forbidden' }))).toBe(false)
  })

  it('повторяет сеть и 5xx не больше двух раз', () => {
    const error = new NetworkError(new TypeError())
    expect(shouldRetryQuery(0, error)).toBe(true)
    expect(shouldRetryQuery(1, error)).toBe(true)
    expect(shouldRetryQuery(2, error)).toBe(false)
    expect(shouldRetryQuery(0, new ApiError({ status: 500 }))).toBe(true)
  })
})

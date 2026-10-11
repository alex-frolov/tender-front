import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** localStorage в памяти: в node-окружении Vitest своего нет. */
function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, String(value)),
  }
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('api/client', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal('localStorage', memoryStorage())
    // В node у относительного /api/v1 нет origin — Request из него не построить.
    vi.stubEnv('VITE_API_BASE', 'http://api.test/api/v1')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('параллельные refresh делят один запрос: бэкенд отзывает использованный токен', async () => {
    localStorage.setItem('tp.refresh_token', 'rt-1')
    let calls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (request: Request) => {
        calls += 1
        const body = (await request.json()) as { refresh_token: string }
        // Как RefreshTokenService::rotate: второй вызов тем же токеном — 401.
        if (body.refresh_token !== 'rt-1' || calls > 1) {
          return json(401, { title: 'Unauthorized', code: 'invalid_credentials' })
        }
        return json(200, { access_token: 'at-2', refresh_token: 'rt-2', expires_in: 900 })
      }),
    )
    const { refreshTokens } = await import('./client')

    const outcomes = await Promise.all([refreshTokens(), refreshTokens()])

    expect(outcomes).toEqual(['ok', 'ok'])
    expect(calls).toBe(1)
    expect(localStorage.getItem('tp.refresh_token')).toBe('rt-2')
  })

  it('сетевой сбой при refresh не стирает токен', async () => {
    localStorage.setItem('tp.refresh_token', 'rt-1')
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))))
    const { refreshTokens } = await import('./client')

    expect(await refreshTokens()).toBe('network-failed')
    expect(localStorage.getItem('tp.refresh_token')).toBe('rt-1')
  })

  it('ensureOk бросает ApiError и на отказ с пустым телом', async () => {
    // Класс берём из той же копии модулей, что и клиент (resetModules).
    const { ensureOk } = await import('./client')
    const { ApiError } = await import('@/lib/errors')
    const response = new Response(null, { status: 404 })

    expect(() => ensureOk({ error: undefined, response })).toThrow(ApiError)
    const noContent = new Response(null, { status: 204 })
    expect(() => ensureOk({ error: undefined, response: noContent })).not.toThrow()
  })

  it('unwrap переносит HTTP-статус в ошибку', async () => {
    const { unwrap } = await import('./client')
    const response = new Response(null, { status: 403 })

    await expect(unwrap({ error: { code: 'forbidden' }, response })).rejects.toMatchObject({
      status: 403,
      code: 'forbidden',
    })
  })
})

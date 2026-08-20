import createClient from 'openapi-fetch'
import type { paths } from './schema'
import type { components } from './schema'
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from '@/lib/auth-store'
import { emitSessionExpired } from '@/lib/authEvents'

/**
 * Базовый URL API. В dev указывает на локальный API (или задеплоенный через
 * VITE_API_BASE), в проде — на проксируемый nginx-путь /api/v1.
 */
const envBase = import.meta.env.VITE_API_BASE as string | undefined

/**
 * Базовый URL API.
 * - По умолчанию (dev): same-origin путь /api/v1 — браузер идёт на Vite,
 *   Vite-proxy перенаправляет на http://127.0.0.1:8080/api/v1. CORS не нужен.
 * - В прод/демо: VITE_API_BASE указывает на деплой (напр. https://api.example.com/api/v1)
 *   либо фронт за nginx-прокси — тогда оставляем /api/v1 по умолчанию.
 */
export const API_BASE: string = envBase ?? '/api/v1'

type ApiError = components['schemas']['Error']

/**
 * Единственный инстанс типизированного клиента с auth-middleware:
 * автоподстановка Bearer-токена, single-flight refresh при 401, ретрай запроса.
 */
export const client = createClient<paths>({
  baseUrl: API_BASE,
})

/**
 * «Голый» клиент БЕЗ auth-middleware — только для token-эндпоинтов
 * (/auth/token, /auth/refresh, /auth/logout, /auth/register). Иначе refresh-флоу
 * зацикливался бы сам на себе (refresh при 401 на самом refresh).
 */
export const authClient = createClient<paths>({
  baseUrl: API_BASE,
})

/** Распаковка результата openapi-fetch: возвращаем data или бросаем error (RFC 9457). */
export async function unwrap<TData>(result: { data?: TData; error?: unknown }): Promise<TData> {
  if (result.error !== undefined) {
    throw result.error as ApiError
  }
  if (result.data === undefined) {
    throw new Error('API вернул пустой ответ без данных')
  }
  return result.data
}

// ---------- Refresh: single-flight очередь ----------

type RefreshOutcome = 'ok' | 'auth-failed' | 'network-failed'

let refreshInFlight: Promise<RefreshOutcome> | null = null

async function doRefresh(): Promise<RefreshOutcome> {
  const refreshToken = getRefreshToken()
  if (refreshToken == null) {
    return 'auth-failed'
  }
  try {
    const result = await authClient.POST('/auth/refresh', {
      body: { refresh_token: refreshToken },
    })
    if (result.error) {
      // HTTP-ошибка (обычно 401 — refresh протух) → сессия мертва.
      return 'auth-failed'
    }
    const data = result.data
    if (data.access_token == null || data.refresh_token == null || data.expires_in == null) {
      return 'auth-failed'
    }
    setTokens({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
    })
    return 'ok'
  } catch {
    // Сетевая ошибка (сервер недоступен) — токены не трогаем, пользователя не выкидываем.
    return 'network-failed'
  }
}

/**
 * Single-flight refresh: несколько параллельных 401 ждут один общий
 * POST /auth/refresh, после чего все retry-запросы получают новый access-токен.
 */
function singleFlightRefresh(): Promise<RefreshOutcome> {
  refreshInFlight ??= doRefresh().finally(() => {
    refreshInFlight = null
  })
  return refreshInFlight
}

// ---------- Auth middleware ----------

/**
 * Эндпоинты, которые не должны обрабатываться auth-middleware (идут через
 * authClient без middleware, но проверка на всякий случай дублируется).
 */
const AUTH_ENDPOINTS = ['/auth/token', '/auth/refresh', '/auth/logout', '/auth/register']

interface PendingRequest {
  /** Клон исходного Request (с телом) для повторной отправки после refresh. */
  request: Request
  /** true — мы реально отправили Bearer и 401 означает «токен невалиден». */
  hadAuth: boolean
}

/** Неотправленные клоны запросов по id (нужны для retry). */
const pendingByRequestId = new Map<string, PendingRequest>()

const authMiddleware = {
  onRequest({ request, schemaPath, id }: { request: Request; schemaPath: string; id: string }) {
    if (AUTH_ENDPOINTS.includes(schemaPath)) {
      return request
    }
    const token = getAccessToken()
    const entry: PendingRequest = { request: request.clone(), hadAuth: token != null }
    pendingByRequestId.set(id, entry)
    if (token) {
      request.headers.set('Authorization', `Bearer ${token}`)
    }
    return request
  },

  async onResponse({ response, id }: { response: Response; id: string }) {
    const pending = pendingByRequestId.get(id)
    pendingByRequestId.delete(id)
    if (response.status !== 401 || pending?.hadAuth !== true) {
      return undefined
    }

    const outcome = await singleFlightRefresh()
    if (outcome !== 'ok') {
      if (outcome === 'auth-failed') {
        // Refresh протух/отозван — сессию не восстановить, чистим и уходим на логин.
        clearTokens()
        emitSessionExpired()
      }
      return undefined
    }

    // Refresh удался: повторяем исходный запрос с новым access-токеном.
    const headers = new Headers(pending.request.headers)
    headers.set('Authorization', `Bearer ${getAccessToken()}`)
    const retry = new Request(pending.request, { headers })
    return fetch(retry)
  },

  onError({ id }: { id: string }) {
    // Сетевая ошибка: ответа не будет, чистим клон запроса, чтобы не копить память.
    pendingByRequestId.delete(id)
  },
}

client.use(authMiddleware)
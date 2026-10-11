import createClient from 'openapi-fetch'
import type { paths } from './schema'
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from '@/lib/auth-store'
import { emitSessionExpired } from '@/lib/authEvents'
import { NetworkError, toApiError } from '@/lib/errors'

/**
 * Базовый URL API.
 * - По умолчанию (dev): same-origin путь /api/v1 — браузер идёт на Vite,
 *   Vite-proxy перенаправляет на http://127.0.0.1:8080/api/v1. CORS не нужен.
 * - В прод/демо: VITE_API_BASE указывает на деплой (напр. https://api.example.com/api/v1)
 *   либо фронт за nginx-прокси — тогда оставляем /api/v1 по умолчанию.
 */
export const API_BASE: string = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api/v1'

/**
 * fetch, который отличает «ответа нет» от программной ошибки: сам fetch в обоих
 * случаях бросает TypeError. Отмену запроса (AbortController React Query)
 * пробрасываем как есть — это не сбой.
 */
async function fetchOrNetworkError(request: Request): Promise<Response> {
  try {
    return await globalThis.fetch(request)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new NetworkError(error)
  }
}

/**
 * Единственный инстанс типизированного клиента с auth-middleware:
 * автоподстановка Bearer-токена, single-flight refresh при 401, ретрай запроса.
 */
export const client = createClient<paths>({ baseUrl: API_BASE, fetch: fetchOrNetworkError })

/**
 * «Голый» клиент БЕЗ auth-middleware — только для token-эндпоинтов
 * (/auth/token, /auth/refresh, /auth/logout, /auth/register). Иначе refresh-флоу
 * зацикливался бы сам на себе (refresh при 401 на самом refresh).
 */
export const authClient = createClient<paths>({ baseUrl: API_BASE, fetch: fetchOrNetworkError })

interface FetchResult<TData> {
  data?: TData
  error?: unknown
  response: Response
}

/**
 * Распаковка результата openapi-fetch: data или `ApiError` со статусом ответа.
 *
 * Проверяем и `response.ok`: на не-2xx ответ с пустым телом openapi-fetch
 * возвращает `error: undefined`, и такой отказ иначе выглядел бы успехом.
 */
export async function unwrap<TData>(result: FetchResult<TData>): Promise<TData> {
  if (result.error !== undefined || !result.response.ok) {
    throw toApiError(result.error, result.response)
  }
  if (result.data === undefined) {
    throw new Error('API вернул пустой ответ без данных')
  }
  return result.data
}

/** Проверка ответа без тела (204/202): бросает `ApiError`, если запрос не удался. */
export function ensureOk(result: { error?: unknown; response: Response }): void {
  if (result.error !== undefined || !result.response.ok) {
    throw toApiError(result.error, result.response)
  }
}

/**
 * Имя файла из Content-Disposition ответа (скачивание документа, экспорта);
 * null, если заголовка нет. `filename*=UTF-8''…` декодируется.
 */
export function filenameFromResponse(response: Response): string | null {
  const header = response.headers.get('content-disposition')
  if (header == null) return null
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header)
  return match?.[1] != null ? decodeURIComponent(match[1]) : null
}

// ---------- Refresh: один на вкладку и по очереди между вкладками ----------

export type RefreshOutcome = 'ok' | 'auth-failed' | 'network-failed'

let refreshInFlight: Promise<RefreshOutcome> | null = null

async function doRefresh(): Promise<RefreshOutcome> {
  // Читаем внутри замка: пока ждали, соседняя вкладка могла ротировать пару,
  // и старый refresh уже отозван.
  const refreshToken = getRefreshToken()
  if (refreshToken == null) {
    return 'auth-failed'
  }
  try {
    const result = await authClient.POST('/auth/refresh', {
      body: { refresh_token: refreshToken },
    })
    if (result.error !== undefined || !result.response.ok) {
      // HTTP-ошибка (обычно 401 — refresh протух или отозван) → сессия мертва.
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

/** Межвкладочный замок (Web Locks API); без поддержки — просто вызов. */
function withRefreshLock(fn: () => Promise<RefreshOutcome>): Promise<RefreshOutcome> {
  if (typeof navigator !== 'undefined' && 'locks' in navigator) {
    return navigator.locks.request('tp.refresh', fn)
  }
  return fn()
}

/**
 * Обновление пары токенов — единственная точка входа для refresh.
 *
 * Бэкенд ротирует refresh-токен и отзывает использованный: повторный
 * `POST /auth/refresh` со старым токеном отвечает 401. Поэтому параллельные
 * вызовы внутри вкладки ждут один общий запрос (single-flight), а между
 * вкладками запросы идут по очереди под Web Lock. Без этого второй вызов
 * (StrictMode запускает bootstrap дважды, две вкладки перезагружаются разом)
 * получал 401 и стирал только что выданную пару.
 */
export function refreshTokens(): Promise<RefreshOutcome> {
  refreshInFlight ??= withRefreshLock(doRefresh).finally(() => {
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

client.use({
  onRequest({ request, schemaPath, id }) {
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

  async onResponse({ response, id }) {
    const pending = pendingByRequestId.get(id)
    pendingByRequestId.delete(id)
    if (response.status !== 401 || pending?.hadAuth !== true) {
      return undefined
    }

    const outcome = await refreshTokens()
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
    return fetchOrNetworkError(new Request(pending.request, { headers }))
  },

  onError({ id }) {
    // Сетевая ошибка: ответа не будет, чистим клон запроса, чтобы не копить память.
    pendingByRequestId.delete(id)
  },
})

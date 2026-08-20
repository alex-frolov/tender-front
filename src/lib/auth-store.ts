/**
 * Токен-стор: access-токен живёт в памяти, refresh-токен — в localStorage.
 *
 * XSS-гигиена: access-токен НИКОГДА не попадает в localStorage/sessionStorage —
 * модульная переменная переживает SPA-навигацию, но умирает при полном reload
 * страницы (сессия восстановится через refresh-токен).
 *
 * TODO(деплой): перевести refresh-токен на HttpOnly-cookie (SameSite=Strict,
 * Secure). Тогда он станет невидим для JS, и localStorage останется только как
 * fallback для окружений без cookie-auth. После этого middleware-ретрай при 401
 * будет работать без участия этого модуля.
 */

const REFRESH_TOKEN_KEY = 'tp.refresh_token'

let accessToken: string | null = null
let accessTokenExpiresAt: number | null = null

export interface TokenSet {
  access_token: string
  refresh_token: string
  /** Время жизни access-токена в секундах (необязательно). */
  expires_in?: number
}

/** Сохранить пару токенов: access — в память, refresh — в localStorage. */
export function setTokens(tokens: TokenSet): void {
  accessToken = tokens.access_token
  accessTokenExpiresAt = tokens.expires_in != null ? Date.now() + tokens.expires_in * 1000 : null
  localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token)
}

/** Полная очистка сессии (логаут / истёкший refresh). */
export function clearTokens(): void {
  accessToken = null
  accessTokenExpiresAt = null
  localStorage.removeItem(REFRESH_TOKEN_KEY)
}

/** Текущий access-токен (может быть протухшим — свежесть проверяет middleware). */
export function getAccessToken(): string | null {
  return accessToken
}

/** Refresh-токен из localStorage (null — пользователь не логинился). */
export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY)
}

/** Есть ли непротухший access-токен (используется при ранних редиректах). */
export function hasValidAccessToken(): boolean {
  return accessToken != null && (accessTokenExpiresAt == null || accessTokenExpiresAt > Date.now())
}
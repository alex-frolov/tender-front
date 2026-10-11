import { authClient, client, ensureOk, unwrap } from './client'
import type { components } from './schema'
import type { RequestBody, ResponseBody } from './types'

export type User = components['schemas']['User']

export interface LoginInput {
  email: string
  password: string
  /** 6-значный TOTP-код (нужен, если у пользователя включена 2FA). */
  totpCode?: string
}

/** Пара токенов после входа — обязательные поля, без которых сессии нет. */
export interface TokenPair {
  access_token: string
  refresh_token: string
  /** Время жизни access-токена в секундах. */
  expires_in?: number
}

export type RegisterInput = RequestBody<'authRegister'>
export type RegisterResult = ResponseBody<'authRegister', 201>

/** Вход по email+паролю (POST /auth/token). Может бросить ApiError с признаком 2FA. */
export async function loginRequest(input: LoginInput): Promise<TokenPair> {
  const result = await authClient.POST('/auth/token', {
    body: {
      email: input.email,
      password: input.password,
      ...(input.totpCode != null && input.totpCode !== '' ? { totp_code: input.totpCode } : {}),
    },
  })
  const data = await unwrap(result)
  if (data.access_token == null || data.refresh_token == null) {
    throw new Error('API вернул токены без access_token/refresh_token')
  }
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in,
  }
}

/** Регистрация компании + первого администратора (POST /auth/register). */
export async function registerRequest(input: RegisterInput): Promise<RegisterResult> {
  const result = await authClient.POST('/auth/register', { body: input })
  return unwrap(result)
}

/** Подтверждение email по токену из письма (POST /auth/email/verify, публичный). */
export async function verifyEmail(token: string): Promise<{ email_verified?: boolean }> {
  const result = await client.POST('/auth/email/verify', { body: { token } })
  return unwrap(result)
}

/** Повторная отправка письма подтверждения (POST /auth/email/resend). */
export async function resendVerification(email: string): Promise<void> {
  const result = await client.POST('/auth/email/resend', { body: { email } })
  ensureOk(result)
}

/**
 * Запрос на восстановление пароля (POST /auth/password/forgot, публичный).
 * API не раскрывает существование аккаунта: 202 возвращается в любом случае.
 * 429 (rate_limited) — ApiError с `retryAfter` из заголовка Retry-After.
 */
export async function forgotPassword(email: string): Promise<void> {
  ensureOk(await authClient.POST('/auth/password/forgot', { body: { email } }))
}

/** Сброс пароля по токену из письма (POST /auth/password/reset, публичный). */
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const result = await authClient.POST('/auth/password/reset', {
    body: { token, new_password: newPassword },
  })
  ensureOk(result)
}

/** Отзыв refresh-токена (POST /auth/logout, идемпотентно). */
export async function logoutRequest(refreshToken: string): Promise<void> {
  await authClient.POST('/auth/logout', { body: { refresh_token: refreshToken } })
}

/** Начало включения 2FA — получить секрет (POST /auth/2fa/setup). */
export async function setup2fa(): Promise<{ secret?: string; otpauth_uri?: string }> {
  const result = await client.POST('/auth/2fa/setup')
  return unwrap(result)
}

/** Подтверждение и включение 2FA (POST /auth/2fa/confirm). */
export async function confirm2fa(secret: string, code: string): Promise<void> {
  await unwrap(
    await client.POST('/auth/2fa/confirm', { body: { secret, code } }),
  )
}

/** Отключение 2FA с подтверждением кода (POST /auth/2fa/disable). */
export async function disable2fa(code: string): Promise<void> {
  await unwrap(await client.POST('/auth/2fa/disable', { body: { code } }))
}

/** Текущий пользователь и компания (GET /users/me). */
export async function getMe(): Promise<{ user?: User; company?: components['schemas']['Company'] }> {
  const result = await client.GET('/users/me')
  return unwrap(result)
}

/** Обновление собственного профиля (PATCH /users/me). */
export async function updateMe(input: RequestBody<'updateMe'>): Promise<User> {
  const result = await client.PATCH('/users/me', { body: input })
  return unwrap(result)
}
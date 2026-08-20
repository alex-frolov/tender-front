/**
 * Шина событий аутентификации. Нужна, чтобы auth-middleware (вне React) мог
 * сообщить AuthProvider о том, что сессия умерла (неудачный refresh при 401),
 * и запустить логаут + редирект на /login.
 */

type SessionExpiredListener = () => void

const listeners = new Set<SessionExpiredListener>()

/** Подписка на «сессия истекла». Возвращает функцию отписки. */
export function onSessionExpired(listener: SessionExpiredListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Уведомить подписчиков о смерти сессии. */
export function emitSessionExpired(): void {
  for (const listener of listeners) {
    listener()
  }
}
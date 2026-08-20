/** Локаль по умолчанию для дат (UI — русский). */
const DATE_LOCALE = 'ru-RU'

/** Дата и время: «17 авг. 2026 г., 14:30». */
export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat(DATE_LOCALE, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso))
}

/** Только дата: «17 авг. 2026 г.». */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(DATE_LOCALE, { dateStyle: 'medium' }).format(new Date(iso))
}

/** Склонение по русской морфологии: plural(3, ['день', 'дня', 'дней']) → «дня». */
export const plural = (n: number, forms: [string, string, string]): string => {
  const abs = Math.abs(n) % 100
  const last = abs % 10
  if (abs > 10 && abs < 20) return forms[2]
  if (last > 1 && last < 5) return forms[1]
  if (last === 1) return forms[0]
  return forms[2]
}

/**
 * «Осталось N дн/час» до дедлайна. Если срок прошёл — «Время вышло».
 * Возвращает готовую строку для UI.
 */
export function formatRemaining(deadlineIso: string, now: Date = new Date()): string {
  const diffMs = new Date(deadlineIso).getTime() - now.getTime()
  if (diffMs <= 0) return 'Время вышло'

  const totalMinutes = Math.floor(diffMs / 60_000)
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60

  if (days > 0) {
    return `Осталось ${days} ${plural(days, ['день', 'дня', 'дней'])} ${hours} ${plural(hours, ['час', 'часа', 'часов'])}`
  }
  if (hours > 0) {
    return `Осталось ${hours} ${plural(hours, ['час', 'часа', 'часов'])} ${minutes} ${plural(minutes, ['минута', 'минуты', 'минут'])}`
  }
  return `Осталось ${minutes} ${plural(minutes, ['минута', 'минуты', 'минут'])}`
}
/**
 * Секунды → «MM:SS» / «H:MM:SS» — таймер аукциона (remaining_sec).
 * Отрицательные значения обрезаются до нуля.
 */
export function formatSeconds(total: number): string {
  const clamped = Math.max(0, Math.floor(total))
  const hours = Math.floor(clamped / 3600)
  const minutes = Math.floor((clamped % 3600) / 60)
  const seconds = clamped % 60
  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`
}

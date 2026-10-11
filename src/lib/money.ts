/**
 * Форматирование денежных сумм. ВАЖНО: все суммы в API передаются в minor units
 * (целые копейки/центы), никогда не float. Форматирование — только через эту
 * функцию (presentation layer), по требованию спеки.
 *
 * @example formatMoney(125000000) // "1 250 000,00 ₽"
 */
export function formatMoney(amountMinor: number, currency: string = 'RUB'): string {
  const amount = amountMinor / 100
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}
/** Пробелы, которыми разделяют разряды: обычный, неразрывный, узкий неразрывный. */
const DIGIT_GROUP_SEPARATORS = /[\s  ]/g

/**
 * Сумма из поля ввода в рублях → minor units (целые копейки).
 *
 * Строка разбирается на рубли и копейки без умножения float на 100:
 * `Math.round(1.005 * 100)` даёт 100, а не 101. Принимает запятую и точку,
 * пробелы между разрядами («1 250 000,50») — так сумму пишут и копируют
 * из документов. Больше двух знаков после запятой — не сумма в рублях.
 *
 * @returns null для пустой строки и для всего, что не является суммой.
 */
export function parseRublesToMinor(input: string): number | null {
  const normalized = input.replace(DIGIT_GROUP_SEPARATORS, '').replace(',', '.')
  const match = /^(-)?(\d*)(?:\.(\d{0,2}))?$/.exec(normalized)
  if (match == null) return null
  const [, sign, rubles = '', kopecks = ''] = match
  if (rubles === '' && kopecks === '') return null
  const minor = Number(rubles || '0') * 100 + Number(kopecks.padEnd(2, '0'))
  if (!Number.isSafeInteger(minor)) return null
  return sign != null && minor !== 0 ? -minor : minor
}

/**
 * minor units → значение поля ввода в рублях: «1250000», «1250000.50».
 * Без разделителей разрядов и символа валюты — строка уходит в `<input>`
 * и должна читаться обратно через parseRublesToMinor.
 */
export function minorToRublesInput(minor: number | null | undefined): string {
  if (minor == null) return ''
  const sign = minor < 0 ? '-' : ''
  const abs = Math.abs(minor)
  const rubles = Math.trunc(abs / 100)
  const kopecks = abs % 100
  return kopecks === 0
    ? `${sign}${rubles}`
    : `${sign}${rubles}.${String(kopecks).padStart(2, '0')}`
}

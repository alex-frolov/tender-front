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
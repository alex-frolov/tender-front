import type { components } from '@/api/schema'
import { formatMoney } from '@/lib/money'

type AuctionState = components['schemas']['AuctionState']

/**
 * Правила ставки для формы: границы, шаг и рекомендованная цена.
 * Всё — в minor units (целые копейки), как в контракте; арифметика целочисленная.
 */
export interface BidRules {
  /** Шаг снижения (REDUCTION + fixed); null — шага нет, цена свободная. */
  step: number | null
  /** Цена-ориентир: текущая, иначе стартовая; null — цены ещё нет (первая ставка задаёт старт). */
  current: number | null
  /** Максимально допустимая цена ставки (включительно); null — сверху не ограничено. */
  max: number | null
  /** Минимально допустимая цена ставки (включительно); null — снизу не ограничено. */
  min: number | null
  /** Что подставить в поле: следующая цена по шагу; null — подсказать нечего. */
  suggested: number | null
  /** Подпись правила под полем ввода. */
  hint: string
}

/**
 * Разбор правил ставки из состояния аукциона (AuctionBidService/BidStepCalculator):
 *
 * - REDUCTION + fixed — цена ≤ current − step; шаг абсолютный (bid_step_minor)
 *   или процентный от стартовой цены (bid_step_percent_bps, floor);
 * - REDUCTION + free — цена строго ниже текущей (максимум = current − 1 копейка);
 * - FREE_PRICE / PRICE_REQUEST — любая цена в границах лимитов, без понижения.
 *
 * Нижняя граница price_min_limit_minor действует во всех режимах. Пока текущей
 * цены нет (no_start_price, первая ставка задаёт старт) верхней границы нет —
 * ограничивают только лимиты.
 */
export function bidRules(state: AuctionState | undefined): BidRules {
  const min = state?.price_min_limit_minor ?? null
  const current = state?.current_price_minor ?? state?.start_price_minor ?? null

  if (state == null) {
    return { step: null, current: null, max: null, min: null, suggested: null, hint: '' }
  }

  if (state.type === 'reduction') {
    const step = reductionStep(state)

    if (current == null) {
      return {
        step,
        current: null,
        max: null,
        min,
        suggested: null,
        hint: firstBidHint(min),
      }
    }

    if (step != null) {
      const max = current - step
      const suggested = min != null && max < min ? null : max
      return {
        step,
        current,
        max,
        min,
        suggested,
        hint:
          suggested == null
            ? `Шаг ${formatMoney(step)}: следующая цена ниже минимума ${formatMoney(min ?? 0)} — торги на пределе`
            : `Шаг ${formatMoney(step)}. Цена не выше ${formatMoney(max)} (текущая ${formatMoney(current)} − шаг)` +
              (min != null ? ` и не ниже ${formatMoney(min)}` : ''),
      }
    }

    // free: любое строгое понижение — максимум на копейку ниже текущей.
    const max = current - 1
    return {
      step: null,
      current,
      max,
      min,
      suggested: null,
      hint:
        `Свободное понижение: цена строго ниже текущей ${formatMoney(current)}` +
        (min != null ? ` и не ниже ${formatMoney(min)}` : ''),
    }
  }

  // FREE_PRICE / PRICE_REQUEST — только границы лимитов, без обязательного понижения.
  const max = state.price_max_limit_minor ?? null
  return {
    step: null,
    current,
    max,
    min,
    suggested: null,
    hint: boundsHint(min, max),
  }
}

/**
 * Шаг REDUCTION+fixed в minor units: абсолютный или процент от стартовой цены,
 * floor — как на бэкенде (MoneyService::stepPercent), чтобы не перескочить лимит.
 * Для step_mode = free шага нет.
 */
function reductionStep(state: AuctionState): number | null {
  if (state.step_mode !== 'fixed') return null
  if (state.bid_step_minor != null && state.bid_step_minor > 0) return state.bid_step_minor

  const bps = state.bid_step_percent_bps
  const start = state.start_price_minor
  if (bps == null || bps <= 0 || start == null) return null

  const step = Math.floor((start * bps) / 10_000)
  return step > 0 ? step : null
}

/** Подсказка для первой ставки при no_start_price (стартовой цены ещё нет). */
function firstBidHint(min: number | null): string {
  const base = 'Первая ставка задаёт стартовую цену'
  return min != null ? `${base}: не ниже ${formatMoney(min)}` : `${base}.`
}

/** Подсказка по лимитам для аукционов без шага и без обязательного понижения. */
function boundsHint(min: number | null, max: number | null): string {
  if (min != null && max != null) return `Цена в пределах ${formatMoney(min)} — ${formatMoney(max)}`
  if (min != null) return `Цена не ниже ${formatMoney(min)}`
  if (max != null) return `Цена не выше ${formatMoney(max)}`
  return 'Цена свободная: понижение не обязательно'
}

/**
 * Проверка цены по правилам — то же, что проверит бэкенд (BidStepCalculator),
 * но до отправки: пользователь видит ошибку сразу, без 409 от API.
 * Возвращает текст ошибки или null, если цена допустима.
 */
export function validateBid(priceMinor: number, rules: BidRules): string | null {
  if (!Number.isFinite(priceMinor) || priceMinor <= 0) {
    return 'Введите цену больше нуля'
  }
  if (rules.min != null && priceMinor < rules.min) {
    return `Цена ниже минимально допустимой ${formatMoney(rules.min)}`
  }
  if (rules.max != null && priceMinor > rules.max) {
    return rules.step != null
      ? `Цена выше допустимой ${formatMoney(rules.max)}: нужно снизить минимум на шаг ${formatMoney(rules.step)}`
      : `Цена выше допустимой ${formatMoney(rules.max)}`
  }
  return null
}

/** minor units → значение поля ввода в рублях («1250000.50»). */
export function minorToInput(minor: number): string {
  return (minor / 100).toFixed(2)
}

/** Значение поля ввода (рубли, запятая или точка) → minor units; NaN при мусоре. */
export function inputToMinor(value: string): number {
  return Math.round(Number(value.replace(',', '.').trim()) * 100)
}

import { describe, expect, it } from 'vitest'
import type { components } from '@/api/schema'
import { bidRules, validateBid } from './bidRules'

type AuctionState = components['schemas']['AuctionState']

const reduction = (patch: Partial<AuctionState>): AuctionState =>
  ({ type: 'reduction', step_mode: 'fixed', ...patch }) as AuctionState

describe('bidRules', () => {
  it('редукцион с абсолютным шагом: максимум = текущая − шаг', () => {
    const rules = bidRules(reduction({ current_price_minor: 100_000, bid_step_minor: 1_000 }))
    expect(rules.max).toBe(99_000)
    expect(rules.suggested).toBe(99_000)
  })

  it('процентный шаг считается от стартовой цены с округлением вниз, как на бэкенде', () => {
    const rules = bidRules(
      reduction({ start_price_minor: 333_333, current_price_minor: 333_333, bid_step_percent_bps: 150 }),
    )
    // 333333 * 1.5% = 4999.995 → 4999
    expect(rules.step).toBe(4_999)
    expect(rules.max).toBe(328_334)
  })

  it('следующий шаг ниже лимита — подсказки нет', () => {
    const rules = bidRules(
      reduction({ current_price_minor: 10_000, bid_step_minor: 1_000, price_min_limit_minor: 9_500 }),
    )
    expect(rules.suggested).toBeNull()
  })

  it('свободное понижение — строго ниже текущей', () => {
    const rules = bidRules(reduction({ step_mode: 'free', current_price_minor: 5_000 }))
    expect(rules.step).toBeNull()
    expect(rules.max).toBe(4_999)
  })

  it('без стартовой цены первая ставка ограничена только лимитом снизу', () => {
    const rules = bidRules(reduction({ bid_step_minor: 100, price_min_limit_minor: 1_000 }))
    expect(rules.max).toBeNull()
    expect(rules.min).toBe(1_000)
  })
})

describe('validateBid', () => {
  const rules = bidRules(
    reduction({ current_price_minor: 100_000, bid_step_minor: 1_000, price_min_limit_minor: 50_000 }),
  )

  it('пропускает цену в границах', () => {
    expect(validateBid(99_000, rules)).toBeNull()
  })

  it.each([0, -1, Number.NaN])('отклоняет непозитивную цену %s', (price) => {
    expect(validateBid(price, rules)).toBe('Введите цену больше нуля')
  })

  it('отклоняет цену выше текущей − шаг и ниже лимита', () => {
    expect(validateBid(99_500, rules)).toMatch(/выше допустимой/)
    expect(validateBid(40_000, rules)).toMatch(/ниже минимально допустимой/)
  })
})

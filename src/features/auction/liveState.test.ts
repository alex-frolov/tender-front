import { describe, expect, it } from 'vitest'
import type { components } from '@/api/schema'
import type { AuctionLiveSnapshot } from '@/hooks/useAuctionStream'
import { mergeLiveSnapshot, remainingFromPlannedEnd } from './liveState'

type AuctionState = components['schemas']['AuctionState']

const base = {
  id: 'a1',
  status: 'trade',
  current_price_minor: 100_000,
  bid_step_minor: 1_000,
  price_min_limit_minor: 50_000,
} as AuctionState

describe('mergeLiveSnapshot', () => {
  it('накладывает снапшот, не теряя правил торгов', () => {
    const merged = mergeLiveSnapshot(base, {
      auction_id: 'a1',
      current_price_minor: 99_000,
    } as AuctionLiveSnapshot)
    expect(merged?.current_price_minor).toBe(99_000)
    expect(merged?.bid_step_minor).toBe(1_000)
    expect(merged?.price_min_limit_minor).toBe(50_000)
  })

  it('игнорирует снапшот чужого аукциона', () => {
    const snapshot = { auction_id: 'other', current_price_minor: 1 } as AuctionLiveSnapshot
    expect(mergeLiveSnapshot(base, snapshot)).toBe(base)
  })
})

describe('remainingFromPlannedEnd', () => {
  const now = new Date('2026-10-11T12:00:00Z')

  it('считает остаток в секундах и не уходит в минус', () => {
    expect(remainingFromPlannedEnd('2026-10-11T12:01:30Z', now)).toBe(90)
    expect(remainingFromPlannedEnd('2026-10-11T11:00:00Z', now)).toBe(0)
  })

  it('пустое и мусорное значение — null', () => {
    expect(remainingFromPlannedEnd(null, now)).toBeNull()
    expect(remainingFromPlannedEnd('not a date', now)).toBeNull()
  })
})

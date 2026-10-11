import { describe, expect, it } from 'vitest'
import { formatMoney, minorToRublesInput, parseRublesToMinor } from './money'

describe('parseRublesToMinor', () => {
  it.each([
    ['1250000', 125_000_000],
    ['1250000.5', 125_000_050],
    ['1250000,50', 125_000_050],
    ['1 250 000,50', 125_000_050],
    ['1 250 000', 125_000_000],
    ['0,07', 7],
    ['.5', 50],
    ['10.', 1000],
    ['-15', -1500],
    ['1.005', null],
  ])('%j → %j', (input, expected) => {
    expect(parseRublesToMinor(input)).toBe(expected)
  })

  it('не теряет копейку там, где float-умножение ошибается', () => {
    // 1.13 * 100 === 112.99999999999999
    expect(parseRublesToMinor('1.13')).toBe(113)
    expect(parseRublesToMinor('4.35')).toBe(435)
  })

  it.each(['', '   ', 'abc', '1,2,3', '1e5', '--1', '.', '12.3.4'])('%j → null', (input) => {
    expect(parseRublesToMinor(input)).toBeNull()
  })

  it('отказывает в суммах за пределами точных целых', () => {
    expect(parseRublesToMinor('900719925474099.99')).toBeNull()
  })
})

describe('minorToRublesInput', () => {
  it.each([
    [125_000_000, '1250000'],
    [125_000_050, '1250000.50'],
    [7, '0.07'],
    [-1500, '-15'],
    [null, ''],
    [undefined, ''],
  ])('%j → %j', (minor, expected) => {
    expect(minorToRublesInput(minor)).toBe(expected)
  })

  it('читается обратно без потерь', () => {
    for (const minor of [0, 1, 99, 100, 101, 123_456_789, 999_999_999_99]) {
      expect(parseRublesToMinor(minorToRublesInput(minor))).toBe(minor)
    }
  })
})

describe('formatMoney', () => {
  it('форматирует minor units в рубли', () => {
    expect(formatMoney(125_000_050).replace(/\s/g, ' ')).toBe('1 250 000,50 ₽')
  })
})

import { describe, expect, it } from 'vitest'
import { compact } from '../src/view/format'

describe('compact numbers', () => {
  it('shows every digit below a million', () => {
    expect(compact(0)).toBe('0')
    expect(compact(12.6)).toBe('13')
    expect(compact(999_999)).toBe('999,999')
  })

  it('shows three figures and a unit from a million up', () => {
    expect(compact(1_000_000)).toBe('1.00M')
    expect(compact(1_234_567)).toBe('1.23M')
    expect(compact(45_678_901)).toBe('45.6M')
    expect(compact(780_938_113)).toBe('780M')
    expect(compact(2.5e12)).toBe('2.50T')
  })

  it('never rounds up into four figures', () => {
    expect(compact(999_999_999)).toBe('999M')
    expect(compact(9_999_999)).toBe('9.99M')
  })

  it('keeps counting past the last unit', () => {
    expect(compact(3e18)).toBe('3000Q')
  })
})

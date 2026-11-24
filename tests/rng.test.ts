import { describe, expect, it } from 'vitest'
import { nextRandom } from '../src/sim/rng'

const take = (seed: number, n: number) => {
  const state = { rng: seed }
  return Array.from({ length: n }, () => nextRandom(state))
}

describe('nextRandom', () => {
  it('gives the same sequence for the same seed', () => {
    expect(take(42, 8)).toEqual(take(42, 8))
  })
  it('gives different sequences for different seeds', () => {
    expect(take(1, 8)).not.toEqual(take(2, 8))
  })
  it('returns values in [0, 1) and advances the state', () => {
    const state = { rng: 7 }
    const values = Array.from({ length: 500 }, () => nextRandom(state))
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...values)).toBeLessThan(1)
    expect(new Set(values).size).toBeGreaterThan(490)
    expect(state.rng).not.toBe(7)
  })
})

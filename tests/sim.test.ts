import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, type SimConfig } from '../src/content/content'
import { createSim, flick, tick } from '../src/sim/sim'
import type { SimEvent, SimState } from '../src/sim/types'

/** Advances the sim in fixed slices and returns every event. */
function run(state: SimState, seconds: number, slice = 0.25): SimEvent[] {
  const events: SimEvent[] = []
  for (let i = 0; i < Math.round(seconds / slice); i++) events.push(...tick(state, slice))
  return events
}

describe('feeding and movement', () => {
  it('feeds one item per feedInterval', () => {
    const s = createSim(DEFAULT_CONFIG, 1)
    const events = run(s, 1)
    expect(events.filter((e) => e.type === 'spawned')).toHaveLength(4)
  })

  it('moves items at beltSpeed', () => {
    const s = createSim(DEFAULT_CONFIG, 1)
    run(s, 0.25) // the first item enters at t = 0.25, at x = 0
    expect(s.items[0].x).toBe(0)
    run(s, 1)
    expect(s.items[0].x).toBeCloseTo(2, 5)
  })

  it('clamps a huge dt', () => {
    const s = createSim(DEFAULT_CONFIG, 1)
    tick(s, 600)
    expect(s.items.length).toBeLessThanOrEqual(1)
  })

  it('ignores NaN and negative dt', () => {
    const s = createSim(DEFAULT_CONFIG, 1)
    expect(tick(s, NaN)).toEqual([])
    expect(tick(s, -1)).toEqual([])
    expect(s.items).toHaveLength(0)
    expect(s.acc).toBe(0)
  })
})

/** A line that feeds nothing by itself, so a test controls every item. */
const QUIET: SimConfig = { ...DEFAULT_CONFIG, feedInterval: 1000 }
const redMarble = (id: number, x: number) => ({ id, family: 'marble' as const, colour: 'red' as const, x })

describe('sorting, jars and swapping', () => {
  it('sorts a matching item at its station', () => {
    const s = createSim(QUIET, 1)
    s.items.push(redMarble(99, 5.9))
    const events = tick(s, 0.25)
    expect(events).toEqual([
      { type: 'sorted', item: expect.objectContaining({ id: 99 }), station: 0, slot: 0, byHand: false, coins: 0, chain: 0 },
    ])
    expect(s.items).toHaveLength(0)
    expect(s.stations[0].count).toBe(1)
    expect(s.sorted).toBe(1)
  })

  it('lets an item of another colour pass', () => {
    const s = createSim(QUIET, 1)
    s.items.push({ id: 99, family: 'button', colour: 'blue', x: 5.9 })
    expect(tick(s, 0.25)).toEqual([])
    expect(s.items).toHaveLength(1)
    expect(s.stations[0].count).toBe(0)
  })

  it('shelves a full jar and replaces it', () => {
    const s = createSim(QUIET, 1)
    s.stations[0].count = 11
    s.items.push(redMarble(99, 5.9))
    const events = tick(s, 0.25)
    expect(events.map((e) => e.type)).toEqual(['sorted', 'jarFull'])
    expect(events[1]).toEqual({ type: 'jarFull', station: 0, shelfIndex: 7, coins: 10 })
    expect(s.shelved).toBe(8)
    expect(s.stations[0].count).toBe(0)
    expect(s.stations[0].swapLeft).toBeGreaterThan(0)
    const later = run(s, 1.25)
    expect(later).toEqual([{ type: 'jarReady', station: 0 }])
    expect(s.stations[0].swapLeft).toBe(0)
  })

  it('lets items pass a swapping jar and recycles them', () => {
    const s = createSim(QUIET, 1)
    s.stations[0].swapLeft = 1.25
    s.items.push(redMarble(99, 5.9))
    expect(tick(s, 0.25).filter((e) => e.type === 'sorted')).toEqual([])
    expect(s.items).toHaveLength(1)
    const events = run(s, 6)
    expect(events.filter((e) => e.type === 'recycled')).toEqual([
      { type: 'recycled', item: expect.objectContaining({ id: 99 }) },
    ])
    expect(s.items).toHaveLength(0)
    expect(s.recycle).toEqual([{ family: 'marble', colour: 'red' }])
  })
})

describe('recycling, hand flick and invariants', () => {
  it('feeds recycled items again before new ones', () => {
    const s = createSim(DEFAULT_CONFIG, 1)
    s.recycle.push({ family: 'button', colour: 'blue' })
    const events = tick(s, 0.25)
    expect(events).toEqual([
      { type: 'spawned', item: expect.objectContaining({ family: 'button', colour: 'blue', x: 0 }) },
    ])
    expect(s.recycle).toHaveLength(0)
    expect(s.created).toBe(0)
  })

  it('flick sorts a matching item by hand', () => {
    const s = createSim(QUIET, 1)
    s.items.push(redMarble(99, 2))
    expect(flick(s, 99)).toEqual([
      { type: 'sorted', item: expect.objectContaining({ id: 99 }), station: 0, slot: 0, byHand: true, coins: 1, chain: 1 },
    ])
    expect(s.items).toHaveLength(0)
    expect(s.stations[0].count).toBe(1)
  })

  it('flick can complete a jar', () => {
    const s = createSim(QUIET, 1)
    s.stations[0].count = 11
    s.items.push(redMarble(99, 2))
    expect(flick(s, 99).map((e) => e.type)).toEqual(['sorted', 'jarFull'])
  })

  it('flick ignores unknown ids and swapping jars', () => {
    const s = createSim(QUIET, 1)
    expect(flick(s, 12345)).toEqual([])
    s.stations[0].swapLeft = 1
    s.items.push(redMarble(99, 2))
    expect(flick(s, 99)).toEqual([])
    expect(s.items).toHaveLength(1)
    expect(s.stations[0].count).toBe(0)
  })

  it('never exceeds maxOnBelt and keeps feeding', () => {
    const s = createSim({ ...DEFAULT_CONFIG, maxOnBelt: 10 }, 3)
    let spawned = 0
    for (let i = 0; i < 480; i++) {
      spawned += tick(s, 0.25).filter((e) => e.type === 'spawned').length
      expect(s.items.length).toBeLessThanOrEqual(10)
    }
    expect(spawned).toBeGreaterThan(100)
  })

  it('is deterministic for any slicing of time', () => {
    const a = createSim(DEFAULT_CONFIG, 7)
    const b = createSim(DEFAULT_CONFIG, 7)
    run(a, 30, 0.25)
    run(b, 30, 1 / 32)
    expect(b).toEqual(a)
    expect(a.sorted).toBeGreaterThan(50)
  })

  it('conserves items', () => {
    const s = createSim(DEFAULT_CONFIG, 11)
    run(s, 120)
    expect(s.created).toBe(s.items.length + s.recycle.length + s.sorted)
    expect(s.shelved).toBeGreaterThan(DEFAULT_CONFIG.startShelved + 20)
  })
})

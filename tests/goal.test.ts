import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, type SimConfig } from '../src/content/content'
import { nextGoal } from '../src/sim/goal'
import { createSim, nextStarAt, upgradeCost } from '../src/sim/sim'
import type { SimState } from '../src/sim/types'

const CONFIG: SimConfig = { ...DEFAULT_CONFIG, rareChance: 0 }

/** A line whose orders are all a long way off, so they never win unless a test says so. */
function line(): SimState {
  const state = createSim(CONFIG, 3)
  state.orders = [
    { kind: 'hand', need: 50, have: 0, worth: 5 },
    { kind: 'hand', need: 50, have: 0, worth: 5 },
    { kind: 'hand', need: 50, have: 0, worth: 5 },
  ]
  return state
}

describe('the next goal', () => {
  it('is the cheapest upgrade that cannot be bought yet, with the wait at the line’s earnings', () => {
    const state = line()
    state.coins = 20
    // The belt costs 80 and is the cheapest; at 2 coins a second it is 30 seconds away.
    expect(nextGoal(state, 2)).toEqual({ kind: 'upgrade', id: 'belt', seconds: 30 })
  })

  it('skips upgrades that can be bought already: those show elsewhere', () => {
    const state = line()
    state.coins = 90 // the belt is affordable, the feeder at 100 is next
    expect(nextGoal(state, 1)).toEqual({ kind: 'upgrade', id: 'feeder', seconds: 10 })
  })

  it('is an order when that will be finished sooner', () => {
    const state = line()
    state.coins = 0
    state.orders[1] = { kind: 'jars', need: 10, have: 8, worth: 5 }
    // Two more jars, one every 3 seconds.
    expect(nextGoal(state, 2)).toEqual({ kind: 'order', slot: 1, seconds: 6 })
    // A jar of one colour comes a third as often.
    state.orders[1] = { kind: 'colour', colour: 'red', need: 10, have: 8, worth: 5 }
    expect(nextGoal(state, 2)).toEqual({ kind: 'order', slot: 1, seconds: 18 })
  })

  it('leaves out orders that are finished or that depend on the player’s own hands', () => {
    const state = line()
    state.orders[0] = { kind: 'jars', need: 10, have: 10, worth: 5 }
    state.orders[1] = { kind: 'hand', need: 10, have: 9, worth: 5 }
    expect(nextGoal(state, 2)?.kind).toBe('upgrade')
  })

  it('is the next star when every upgrade in reach is bought', () => {
    const state = line()
    state.coins = 1e12
    state.upgrades = { feeder: 8, belt: 8, lids: 200, luck: 6, spotter: 1, orders: 10, rush: 5 }
    state.runEarned = nextStarAt(state) - 500
    expect(upgradeCost(state, 'lids')).toBeNull()
    expect(nextGoal(state, 10)).toEqual({ kind: 'star', seconds: 50 })
  })

  it('is the next rank of a marble when that is nearest', () => {
    const state = createSim(DEFAULT_CONFIG, 3)
    state.orders = line().orders
    state.coins = 0
    state.collection = { galaxy: 1, catseye: 4 }
    // Cat's Eye needs 1 more for bronze; Galaxy needs 4 more and is far rarer.
    const goal = nextGoal(state, 0.001)
    expect(goal).toMatchObject({ kind: 'marble', rare: 'catseye', rank: 2, more: 1 })
    // One marble in 200 is rare, 6 in 45 of those are a Cat's Eye, and 4 marbles arrive each second.
    expect(goal!.seconds).toBeCloseTo((200 * 45) / 6 / 4, 3)
  })

  it('still names something when the line earns nothing yet', () => {
    const state = line()
    state.orders[0] = { kind: 'jars', need: 10, have: 0, worth: 5 }
    expect(nextGoal(state, 0)).toEqual({ kind: 'order', slot: 0, seconds: 30 })
    state.orders[0] = { kind: 'hand', need: 10, have: 0, worth: 5 }
    expect(nextGoal(state, 0)).toBeNull()
  })
})

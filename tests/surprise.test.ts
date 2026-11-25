import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, LUCKY_GIFTS, type LuckyGift, type SimConfig } from '../src/content/content'
import { parseSave, resume, toSave } from '../src/sim/save'
import {
  catchLucky,
  chainTip,
  claimOrder,
  createSim,
  flick,
  giveLucky,
  prestige,
  rareChance,
  rareChanceNow,
  steadyIncome,
  steadyJarPay,
  tick,
  upgradeCost,
} from '../src/sim/sim'
import { warmUp } from '../src/sim/warmup'
import type { SimEvent, SimState } from '../src/sim/types'

/** A line where nothing arrives by itself and no jar ever fills, so each test places the items it needs. */
const QUIET: SimConfig = { ...DEFAULT_CONFIG, rareChance: 0, startShelved: 0, feedInterval: 1000, jarCapacity: 100_000 }
const NOW = 1_800_000_000_000

const ofType = <T extends SimEvent['type']>(events: SimEvent[], type: T) =>
  events.filter((event): event is Extract<SimEvent, { type: T }> => event.type === type)

/** Runs the line and returns every event with the second it happened in. */
function run(state: SimState, seconds: number, each?: (second: number) => void): { at: number; event: SimEvent }[] {
  const log: { at: number; event: SimEvent }[] = []
  for (let t = 0; t < seconds; t += 0.25) {
    each?.(t)
    for (const event of tick(state, 0.25)) log.push({ at: t + 0.25, event })
  }
  return log
}

let nextId = 5000
const COLOURS = ['red', 'yellow', 'blue'] as const
function sortByHand(state: SimState): SimEvent[] {
  const id = nextId++
  state.items.push({ id, family: 'button', colour: COLOURS[id % 3], x: 1 })
  return flick(state, id)
}
function catchByHand(state: SimState): SimEvent[] {
  const id = nextId++
  state.items.push({ id, family: 'marble', colour: 'red', x: 1, rare: 'catseye' })
  return flick(state, id)
}

describe('the lucky marble', () => {
  it('first comes after a minute and a half, stays a short while and leaves, then comes back every few minutes', () => {
    const state = createSim(QUIET, 3)
    const log = run(state, 900)
    const arrived = log.filter((entry) => entry.event.type === 'luckyArrived').map((entry) => entry.at)
    const gone = log.filter((entry) => entry.event.type === 'luckyGone').map((entry) => entry.at)
    expect(arrived[0]).toBeCloseTo(QUIET.luckyFirst, 0)
    expect(gone[0] - arrived[0]).toBeCloseTo(QUIET.luckySeconds, 0)
    expect(arrived.length).toBeGreaterThanOrEqual(3)
    for (let i = 1; i < arrived.length; i++) {
      const wait = arrived[i] - gone[i - 1]
      expect(wait).toBeGreaterThanOrEqual(QUIET.luckyEvery[0] - 0.5)
      expect(wait).toBeLessThanOrEqual(QUIET.luckyEvery[1] + 0.5)
    }
  })

  it('cannot be caught when it is not there', () => {
    const state = createSim(QUIET, 3)
    expect(catchLucky(state)).toEqual([])
    expect(state.luckyCaught).toBe(0)
  })

  it('gives one gift when caught, is gone at once and comes back later', () => {
    const state = createSim(QUIET, 3)
    run(state, QUIET.luckyFirst + 1)
    expect(state.luckyLeft).toBeGreaterThan(0)
    const events = catchLucky(state)
    expect(ofType(events, 'luckyCaught')).toHaveLength(1)
    expect(state.luckyLeft).toBe(0)
    expect(state.luckyCaught).toBe(1)
    expect(state.luckyIn).toBeGreaterThanOrEqual(QUIET.luckyEvery[0])
    expect(state.luckyIn).toBeLessThanOrEqual(QUIET.luckyEvery[1])
    expect(catchLucky(state)).toEqual([])
    // No "it left" notice follows a catch.
    expect(ofType(run(state, 20).map((entry) => entry.event), 'luckyGone')).toHaveLength(0)
  })

  it('a gift of coins pays three minutes of the line’s steady earnings, and counts toward stars', () => {
    const state = createSim(DEFAULT_CONFIG, 3)
    state.stars = 2
    state.upgrades.lids = 5
    const expected = Math.round(steadyIncome(state) * DEFAULT_CONFIG.luckyCoinSeconds)
    // 4 items a second fill a jar of 12 every 3 seconds.
    expect(steadyIncome(state)).toBeCloseTo(steadyJarPay(state) / 3, 6)
    const events: SimEvent[] = []
    giveLucky(state, 'coins', events)
    expect(ofType(events, 'luckyCaught')[0]).toMatchObject({ gift: 'coins', coins: expected })
    expect(state.coins).toBe(expected)
    expect(state.runEarned).toBe(expected)
  })

  it('a frenzy multiplies every payment for half a minute, on top of a rush, and then ends', () => {
    const state = createSim({ ...QUIET, jarCapacity: 12, handTip: 0 }, 3)
    const jarPay = () => {
      state.stations[0].count = 11
      const id = nextId++
      state.items.push({ id, family: 'button', colour: 'red', x: 1 })
      const paid = ofType(flick(state, id), 'jarFull')[0].coins
      state.stations[0].swapLeft = 0
      return paid
    }
    expect(jarPay()).toBe(10)
    giveLucky(state, 'frenzy', [])
    expect(state.frenzyLeft).toBe(QUIET.frenzySeconds)
    expect(jarPay()).toBe(10 * QUIET.frenzyPay)
    state.rushLeft = 5
    expect(jarPay()).toBe(10 * QUIET.frenzyPay * QUIET.rushPay)
    state.rushLeft = 0
    const log = run(state, QUIET.frenzySeconds + 1)
    expect(log.filter((entry) => entry.event.type === 'frenzyEnded')).toHaveLength(1)
    expect(state.frenzyLeft).toBe(0)
    expect(jarPay()).toBe(10)
  })

  it('a shower puts five rare marbles on the belt, one after another', () => {
    const state = createSim({ ...QUIET, feedInterval: 0.25 }, 3)
    const events: SimEvent[] = []
    giveLucky(state, 'shower', events)
    expect(ofType(events, 'luckyCaught')[0].gift).toBe('shower')
    const spawned = ofType(tick(state, 0.25).concat(tick(state, 0.25), tick(state, 0.25), tick(state, 0.25), tick(state, 0.25), tick(state, 0.25)), 'spawned')
    expect(spawned.slice(0, 5).every((event) => event.item.rare)).toBe(true)
    expect(spawned[5].item.rare).toBeUndefined()
  })

  it('a finished order goes to the order furthest from done; with none left to finish the gift is coins', () => {
    const state = createSim({ ...DEFAULT_CONFIG, rareChance: 0 }, 3)
    state.orders = [
      { kind: 'jars', need: 10, have: 9, worth: 5 },
      { kind: 'hand', need: 20, have: 2, worth: 2 },
      { kind: 'catch', need: 1, have: 1, worth: 4 },
    ]
    const events: SimEvent[] = []
    giveLucky(state, 'order', events)
    expect(state.orders[1].have).toBe(20)
    expect(ofType(events, 'orderReady')).toEqual([{ type: 'orderReady', slot: 1 }])
    expect(ofType(events, 'luckyCaught')[0]).toMatchObject({ gift: 'order', slot: 1 })

    state.orders[0].have = 10
    const again: SimEvent[] = []
    giveLucky(state, 'order', again)
    expect(ofType(again, 'luckyCaught')[0].gift).toBe('coins')
    expect(state.coins).toBe(Math.round(steadyIncome(state) * DEFAULT_CONFIG.luckyCoinSeconds))
  })

  it('a free upgrade adds one level and costs nothing', () => {
    const state = createSim(QUIET, 3)
    state.coins = 50
    const events: SimEvent[] = []
    giveLucky(state, 'upgrade', events)
    const caught = ofType(events, 'luckyCaught')[0]
    expect(caught.gift).toBe('upgrade')
    expect(state.upgrades[caught.upgrade!]).toBe(1)
    expect(Object.values(state.upgrades).reduce((sum, level) => sum + level, 0)).toBe(1)
    expect(state.coins).toBe(50)
  })

  it('gives every kind of gift over many catches, about as often as its weight says', () => {
    const tally: Record<LuckyGift, number> = { coins: 0, frenzy: 0, shower: 0, order: 0, upgrade: 0 }
    const catches = 2000
    for (let seed = 1; seed <= catches; seed++) {
      const state = createSim(QUIET, seed * 7919)
      state.luckyLeft = 5
      tally[ofType(catchLucky(state), 'luckyCaught')[0].gift]++
    }
    const total = LUCKY_GIFTS.reduce((sum, entry) => sum + entry.weight, 0)
    for (const { gift, weight } of LUCKY_GIFTS) {
      const share = tally[gift] / catches
      expect(share, gift).toBeGreaterThan((weight / total) * 0.7)
      expect(share, gift).toBeLessThan((weight / total) * 1.3)
    }
  })

  it('does not change which items arrive', () => {
    const withLucky = createSim(DEFAULT_CONFIG, 11)
    const without = createSim({ ...DEFAULT_CONFIG, luckyFirst: 1e9 }, 11)
    run(withLucky, 400)
    run(without, 400)
    expect(withLucky.rng).toBe(without.rng)
    expect(withLucky.created).toBe(without.created)
  })
})

describe('the sorting chain', () => {
  /** No rush can start here, so the tips show the chain alone. */
  const TIPPED: SimConfig = { ...QUIET, handTip: 10, rushHits: 1e9 }

  it('grows the tip with every quick hand sort, up to five times the plain tip', () => {
    const state = createSim(TIPPED, 3)
    const tips: number[] = []
    for (let i = 0; i < 45; i++) {
      const sorted = ofType(sortByHand(state), 'sorted')[0]
      expect(sorted.chain).toBe(i + 1)
      tips.push(sorted.coins)
      tick(state, 0.25)
    }
    expect(tips.slice(0, 3)).toEqual([10, 11, 12])
    expect(tips[20]).toBe(30)
    expect(tips[40]).toBe(50)
    expect(tips[44]).toBe(50)
    expect(chainTip(state)).toBe(5)
    expect(state.bestChain).toBe(45)
  })

  it('ends quietly a moment after the last hand sort, and the best one is remembered', () => {
    const state = createSim(TIPPED, 3)
    for (let i = 0; i < 4; i++) sortByHand(state)
    tick(state, 0.25)
    tick(state, 0.25)
    tick(state, 0.25)
    tick(state, 0.25)
    tick(state, 0.25)
    expect(state.chain).toBe(4) // 1.25 seconds: still going
    const events = tick(state, 0.25).concat(tick(state, 0.25))
    expect(ofType(events, 'chainEnded')).toEqual([{ type: 'chainEnded', length: 4 }])
    expect(state.chain).toBe(0)
    expect(state.bestChain).toBe(4)
    expect(state.coins).toBe(10 + 11 + 12 + 13) // nothing is taken away
    expect(ofType(sortByHand(state), 'sorted')[0].coins).toBe(10)
    expect(state.bestChain).toBe(4)
  })

  it('counts a rare marble caught by hand as part of the chain', () => {
    const state = createSim(TIPPED, 3)
    sortByHand(state)
    catchByHand(state)
    expect(ofType(sortByHand(state), 'sorted')[0].chain).toBe(3)
  })

  it('fills the rush meter twice as fast once it is ten long', () => {
    const state = createSim(QUIET, 3)
    for (let i = 0; i < 9; i++) sortByHand(state)
    expect(state.rushCharge).toBe(9)
    for (let i = 0; i < 3; i++) sortByHand(state)
    expect(state.rushCharge).toBe(9 + 3 * 2)
  })

  it('is not touched by what the flippers sort', () => {
    const state = createSim({ ...DEFAULT_CONFIG, rareChance: 0 }, 3)
    const sorted = ofType(run(state, 20).map((entry) => entry.event), 'sorted')
    expect(sorted.length).toBeGreaterThan(10)
    expect(sorted.every((event) => event.chain === 0)).toBe(true)
    expect(state.chain).toBe(0)
  })
})

describe('rare marbles after a dry spell', () => {
  it('turn up at the usual rate until two usual waits have gone by, and for certain by the third', () => {
    const state = createSim(DEFAULT_CONFIG, 3)
    const base = rareChance(state)
    const usualWait = 1 / base
    expect(rareChanceNow(state)).toBe(base)
    state.sinceRare = usualWait * 2
    expect(rareChanceNow(state)).toBe(base)
    state.sinceRare = usualWait * 2.5
    expect(rareChanceNow(state)).toBeCloseTo(base + (1 - base) / 2, 6)
    state.sinceRare = usualWait * 3
    expect(rareChanceNow(state)).toBe(1)
  })

  it('never keep a working line waiting longer than three usual waits, and stay about as rare as before', () => {
    const state = createSim({ ...DEFAULT_CONFIG, luckyFirst: 1e9 }, 5)
    state.upgrades.spotter = 1 // every rare marble leaves the belt, so the next one can always be dealt
    const usualWait = 1 / rareChance(state)
    let longest = 0
    let rares = 0
    let createdAtLast = state.created
    for (let t = 0; t < 3 * 3600; t += 0.25) {
      for (const event of tick(state, 0.25)) {
        if (event.type !== 'spawned' || !event.item.rare) continue
        rares++
        longest = Math.max(longest, state.created - createdAtLast)
        createdAtLast = state.created
      }
    }
    expect(rares).toBeGreaterThan(150)
    expect(longest).toBeLessThanOrEqual(usualWait * 3 + 1)
    const perItem = rares / state.created
    expect(perItem).toBeGreaterThan(0.9 / usualWait)
    expect(perItem).toBeLessThan(1.3 / usualWait)
  })

  it('starts counting again when a rare marble is dealt', () => {
    const state = createSim({ ...DEFAULT_CONFIG, feedInterval: 0.25 }, 3)
    state.sinceRare = 3 / rareChance(state)
    const spawned = ofType(tick(state, 0.25), 'spawned')
    expect(spawned[0].item.rare).toBeDefined()
    expect(state.sinceRare).toBe(0)
  })
})

describe('a new player’s first minutes', () => {
  it('begin with short orders; after three are claimed they are full size', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const state = createSim(DEFAULT_CONFIG, seed)
      for (const order of state.orders) {
        if (order.kind === 'jars') expect(order.need).toBeLessThanOrEqual(25)
        if (order.kind === 'colour') expect(order.need).toBeLessThanOrEqual(8)
        if (order.kind === 'hand') expect(order.need).toBeLessThanOrEqual(15)
        if (order.kind === 'catch') expect(order.need).toBe(1)
      }
      state.ordersDone = 3
      state.orders.forEach((order) => (order.have = order.need))
      state.orders.forEach((_, slot) => claimOrder(state, slot))
      for (const order of state.orders) if (order.kind === 'jars') expect(order.need).toBeGreaterThanOrEqual(30)
    }
  })

  it('bring something good early to a player who only watches', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const state = createSim(DEFAULT_CONFIG, seed * 104_729)
      warmUp(state, 8, 1 / 32, () => {}) // the page opens on a line that is already working
      let firstUpgrade = Infinity
      let firstOrder = Infinity
      let firstRare = Infinity
      let firstLucky = Infinity
      const cheapest = Math.min(...(['belt', 'feeder', 'lids'] as const).map((id) => upgradeCost(state, id)!))
      for (let t = 0.25; t <= 240; t += 0.25) {
        for (const event of tick(state, 0.25)) {
          if (event.type === 'orderReady') firstOrder = Math.min(firstOrder, t)
          if (event.type === 'spawned' && event.item.rare) firstRare = Math.min(firstRare, t)
          if (event.type === 'luckyArrived') firstLucky = Math.min(firstLucky, t)
        }
        if (state.coins >= cheapest) firstUpgrade = Math.min(firstUpgrade, t)
      }
      expect(firstUpgrade, `upgrade, seed ${seed}`).toBeLessThanOrEqual(30)
      expect(firstLucky, `lucky, seed ${seed}`).toBeLessThanOrEqual(91)
      expect(firstOrder, `order, seed ${seed}`).toBeLessThanOrEqual(120)
      expect(firstRare, `rare, seed ${seed}`).toBeLessThanOrEqual(180)
    }
  })

  it('bring a rush within a minute to a player who sorts one item a second', () => {
    const state = createSim(DEFAULT_CONFIG, 21)
    let rushAt = Infinity
    for (let t = 0.25; t <= 60 && rushAt === Infinity; t += 0.25) {
      const events = tick(state, 0.25)
      if (t % 1 === 0) {
        const item = state.items.find((candidate) => !candidate.rare && candidate.x > 1 && candidate.x < 5)
        if (item) events.push(...flick(state, item.id))
      }
      if (events.some((event) => event.type === 'rushStarted')) rushAt = t
    }
    expect(rushAt).toBeLessThanOrEqual(60)
  })
})

describe('saving the new parts', () => {
  it('keeps the wait for the lucky marble, a running frenzy, the best chain and the dry spell', () => {
    const state = createSim(DEFAULT_CONFIG, 3)
    state.luckyIn = 77
    state.luckyCaught = 4
    state.frenzyLeft = 12.5
    state.bestChain = 31
    state.sinceRare = 140
    const data = parseSave(JSON.parse(JSON.stringify(toSave(state, NOW))))!
    const { state: back } = resume(DEFAULT_CONFIG, 9, data, NOW + 5_000)
    expect(back.luckyIn).toBe(77)
    expect(back.luckyCaught).toBe(4)
    expect(back.frenzyLeft).toBe(12.5)
    expect(back.bestChain).toBe(31)
    expect(back.sinceRare).toBe(140)
    expect(back.chain).toBe(0)
  })

  it('gives a save from before them the first lucky marble after a minute and a half', () => {
    const old = JSON.parse(JSON.stringify(toSave(createSim(DEFAULT_CONFIG, 3), NOW)))
    for (const key of ['luckyIn', 'luckyCaught', 'frenzyLeft', 'bestChain', 'sinceRare']) delete old[key]
    const { state } = resume(DEFAULT_CONFIG, 9, parseSave(old), NOW + 5_000)
    expect(state.luckyIn).toBe(DEFAULT_CONFIG.luckyFirst)
    expect(state.luckyCaught).toBe(0)
    expect(state.frenzyLeft).toBe(0)
    expect(state.bestChain).toBe(0)
    expect(state.sinceRare).toBe(0)
  })

  it('does not trust numbers that make no sense', () => {
    const raw = JSON.parse(JSON.stringify(toSave(createSim(DEFAULT_CONFIG, 3), NOW)))
    Object.assign(raw, { luckyIn: 1e12, luckyCaught: -4, frenzyLeft: 1e9, bestChain: 'many', sinceRare: 1e30 })
    const { state } = resume(DEFAULT_CONFIG, 9, parseSave(raw), NOW + 5_000)
    expect(state.luckyIn).toBe(DEFAULT_CONFIG.luckyEvery[1])
    expect(state.luckyCaught).toBe(0)
    expect(state.frenzyLeft).toBe(DEFAULT_CONFIG.frenzySeconds)
    expect(state.bestChain).toBe(0)
    expect(rareChanceNow(state)).toBe(1) // a very long dry spell only means the next marble is a rare one
  })

  it('the rehearsal before the first frame brings no lucky marble and uses up no frenzy or dry spell', () => {
    const state = createSim(DEFAULT_CONFIG, 3)
    state.luckyIn = 2
    state.frenzyLeft = 20
    state.sinceRare = 50
    const seen: SimEvent[] = []
    warmUp(state, 8, 1 / 32, (events) => seen.push(...events))
    expect(seen.some((event) => event.type === 'luckyArrived' || event.type === 'frenzyEnded')).toBe(false)
    expect(state.luckyIn).toBe(2)
    expect(state.luckyLeft).toBe(0)
    expect(state.frenzyLeft).toBe(20)
    expect(state.sinceRare).toBe(50)
  })

  it('a new workshop leaves the lucky marble and the best chain alone', () => {
    const state = createSim(DEFAULT_CONFIG, 3)
    state.runEarned = DEFAULT_CONFIG.starCoins * 4
    state.luckyIn = 33
    state.bestChain = 12
    state.frenzyLeft = 9
    expect(prestige(state)).toBe(2)
    expect(state.luckyIn).toBe(33)
    expect(state.bestChain).toBe(12)
    expect(state.frenzyLeft).toBe(9) // a gift already given is kept
  })
})

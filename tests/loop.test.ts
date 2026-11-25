import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, MASTERY_AT, type SimConfig } from '../src/content/content'
import { awayEarnings, parseSave, payAway, resume, toSave } from '../src/sim/save'
import {
  claimOrder,
  collectionBonus,
  createSim,
  flick,
  masteryRank,
  nextStarAt,
  orderReward,
  prestige,
  rareChance,
  rushSeconds,
  starsWaiting,
  steadyJarPay,
  tick,
} from '../src/sim/sim'
import { warmUp } from '../src/sim/warmup'
import type { Order, SimEvent, SimState } from '../src/sim/types'

/** A line where nothing arrives by itself, so each test places the items it needs. */
const QUIET: SimConfig = { ...DEFAULT_CONFIG, rareChance: 0, startShelved: 0, feedInterval: 1000 }
const NOW = 1_800_000_000_000

const ofType = <T extends SimEvent['type']>(events: SimEvent[], type: T) =>
  events.filter((event): event is Extract<SimEvent, { type: T }> => event.type === type)

let nextId = 1000
/** Puts an item on the belt and sorts it by hand. */
function sortByHand(state: SimState, colour: 'red' | 'yellow' | 'blue' = 'red'): SimEvent[] {
  const id = nextId++
  state.items.push({ id, family: 'button', colour, x: 1 })
  return flick(state, id)
}

/** Puts a rare marble on the belt and catches it by hand. */
function catchByHand(state: SimState, rare: 'oxblood' | 'catseye' | 'galaxy' = 'catseye'): SimEvent[] {
  const id = nextId++
  state.items.push({ id, family: 'marble', colour: 'red', x: 1, rare })
  return flick(state, id)
}

/** Fills the red jar but for one item, then sorts that last item by hand. */
function fillRedJar(state: SimState): SimEvent[] {
  state.stations[0].count = state.config.jarCapacity - 1
  return sortByHand(state, 'red')
}

const order = (kind: Order['kind'], need: number, extra: Partial<Order> = {}): Order => ({ kind, need, have: 0, worth: need, ...extra })

describe('orders', () => {
  it('starts with three orders of different kinds, none of them begun', () => {
    const { orders } = createSim(DEFAULT_CONFIG, 7)
    expect(orders).toHaveLength(3)
    expect(new Set(orders.map((o) => o.kind)).size).toBe(3)
    for (const o of orders) {
      expect(o.have).toBe(0)
      expect(o.need).toBeGreaterThan(0)
      expect(o.worth).toBeGreaterThan(0)
      expect(o.kind === 'colour').toBe(o.colour !== undefined)
    }
  })

  it('draws the same orders from the same seed, without touching the stream of items', () => {
    expect(createSim(DEFAULT_CONFIG, 7).orders).toEqual(createSim(DEFAULT_CONFIG, 7).orders)
    expect(createSim(DEFAULT_CONFIG, 7).rng).toBe(7)
  })

  it('counts a full jar toward a jars order and the order for its colour', () => {
    const state = createSim(QUIET, 1)
    state.orders = [order('jars', 2), order('colour', 1, { colour: 'red' }), order('colour', 1, { colour: 'blue' })]
    const events = fillRedJar(state)
    expect(state.orders.map((o) => o.have)).toEqual([1, 1, 0])
    expect(ofType(events, 'orderReady').map((e) => e.slot)).toEqual([1])
  })

  it('counts hand sorts and catches toward their orders, and never past what was asked', () => {
    const state = createSim(QUIET, 1)
    state.orders = [order('hand', 2), order('catch', 1), order('jars', 5)]
    const events = [...sortByHand(state), ...sortByHand(state), ...sortByHand(state), ...catchByHand(state), ...catchByHand(state)]
    expect(state.orders.map((o) => o.have)).toEqual([2, 1, 0])
    expect(ofType(events, 'orderReady').map((e) => e.slot)).toEqual([0, 1])
  })

  it('pays a finished order when it is claimed and replaces it with a kind that is not on the board', () => {
    const state = createSim(QUIET, 1)
    state.orders = [order('hand', 1, { have: 1, worth: 6 }), order('catch', 1), order('jars', 5)]
    const reward = orderReward(state, state.orders[0])
    const items = state.rng
    expect(reward).toBe(6 * QUIET.jarCoins)
    expect(claimOrder(state, 0)).toBe(reward)
    expect(state.rng).toBe(items) // new orders never change which items arrive
    expect(state.coins).toBe(reward)
    expect(state.earned).toBe(reward)
    expect(state.ordersDone).toBe(1)
    expect(state.orders[0].have).toBe(0)
    expect(['catch', 'jars']).not.toContain(state.orders[0].kind)
  })

  it('does not pay an order that is not finished', () => {
    const state = createSim(QUIET, 1)
    state.orders = [order('hand', 2, { have: 1 }), order('catch', 1), order('jars', 5)]
    const before = structuredClone(state.orders)
    expect(claimOrder(state, 0)).toBeNull()
    expect(claimOrder(state, 9)).toBeNull()
    expect(state.coins).toBe(0)
    expect(state.orders).toEqual(before)
  })

  it('pays more for the same order once jars are worth more', () => {
    const state = createSim(QUIET, 1)
    const o = order('jars', 10, { worth: 5 })
    const plain = orderReward(state, o)
    state.upgrades.lids = 5
    expect(orderReward(state, o)).toBe(plain * 2)
    state.upgrades.orders = 2
    expect(orderReward(state, o)).toBe(Math.round(plain * 2 * 1.2))
  })
})

describe('rush', () => {
  const FAST: SimConfig = { ...QUIET, rushHits: 3 }

  it('starts when enough items have been sorted by hand', () => {
    const state = createSim(FAST, 1)
    expect(ofType([...sortByHand(state), ...sortByHand(state)], 'rushStarted')).toHaveLength(0)
    expect(state.rushCharge).toBe(2)
    expect(ofType(sortByHand(state), 'rushStarted')).toHaveLength(1)
    expect(state.rushLeft).toBe(FAST.rushSeconds)
    expect(state.rushCharge).toBe(0)
  })

  it('pays three times as much while it lasts, then ends', () => {
    const state = createSim(FAST, 1)
    for (let i = 0; i < 3; i++) sortByHand(state, 'blue')
    const [full] = ofType(fillRedJar(state), 'jarFull')
    expect(full.coins).toBe(FAST.jarCoins * FAST.rushPay)

    const events: SimEvent[] = []
    for (let t = 0; t < FAST.rushSeconds + 1; t += 0.125) events.push(...tick(state, 0.125))
    expect(ofType(events, 'rushEnded')).toHaveLength(1)
    expect(state.rushLeft).toBe(0)
    const [after] = ofType(fillRedJar(state), 'jarFull')
    expect(after.coins).toBe(FAST.jarCoins)
  })

  it('triples tips and catches too, and brings rare marbles twice as often', () => {
    const state = createSim(FAST, 1)
    const calm = rareChance({ ...state, config: { ...FAST, rareChance: 0.01 } })
    for (let i = 0; i < 3; i++) sortByHand(state, 'blue')
    expect(ofType(sortByHand(state), 'sorted')[0].coins).toBe(FAST.handTip * FAST.rushPay)
    expect(ofType(catchByHand(state, 'oxblood'), 'caught')[0].coins).toBe(90 * 2 * FAST.rushPay)
    expect(rareChance({ ...state, config: { ...FAST, rareChance: 0.01 } })).toBeCloseTo(calm * 2)
  })

  it('counts a rare marble caught by hand as five hand sorts', () => {
    const state = createSim({ ...QUIET, rushHits: 12 }, 1)
    catchByHand(state)
    expect(state.rushCharge).toBe(5)
  })

  it('starts with the longer time once the upgrade is bought', () => {
    const state = createSim(FAST, 1)
    state.upgrades.rush = 3
    for (let i = 0; i < 3; i++) sortByHand(state, 'blue')
    expect(state.rushLeft).toBe(FAST.rushSeconds + 6)
  })

  it('does not fill the next one while it is running', () => {
    const state = createSim(FAST, 1)
    for (let i = 0; i < 5; i++) sortByHand(state, 'blue')
    expect(state.rushLeft).toBeGreaterThan(0)
    expect(state.rushCharge).toBe(0)
  })

  it('lasts longer with the upgrade', () => {
    const state = createSim(FAST, 1)
    const plain = rushSeconds(state)
    state.upgrades.rush = 2
    expect(rushSeconds(state)).toBeGreaterThan(plain)
  })
})

describe('marble mastery', () => {
  it('ranks a marble by how many were caught', () => {
    expect(masteryRank(0)).toBe(0)
    expect(MASTERY_AT.map((n) => masteryRank(n))).toEqual([1, 2, 3, 4])
    expect(masteryRank(MASTERY_AT[1] - 1)).toBe(1)
    expect(masteryRank(1e9)).toBe(MASTERY_AT.length)
  })

  it('adds a lasting coin bonus for every rank, more for rarer marbles', () => {
    const state = createSim(QUIET, 1)
    expect(collectionBonus(state)).toBe(0)
    state.collection.catseye = 1 // uncommon, first rank
    expect(collectionBonus(state)).toBeCloseTo(0.02)
    state.collection.galaxy = MASTERY_AT[1] // legendary, second rank
    expect(collectionBonus(state)).toBeCloseTo(0.02 + 2 * 3 * 0.02)
  })

  it('pays more for a jar once marbles are mastered', () => {
    const state = createSim(QUIET, 1)
    state.collection = { galaxy: MASTERY_AT[3], comet: MASTERY_AT[3], aurora: MASTERY_AT[3] } // 3 × 4 ranks × 6%
    const [full] = ofType(fillRedJar(state), 'jarFull')
    expect(full.coins).toBe(Math.round(QUIET.jarCoins * 1.72))
  })
})

describe('a new workshop', () => {
  it('offers no star before enough is earned, then more the longer the run', () => {
    const state = createSim(QUIET, 1)
    state.runEarned = QUIET.starCoins - 1
    expect(starsWaiting(state)).toBe(0)
    expect(nextStarAt(state)).toBe(QUIET.starCoins)
    state.runEarned = QUIET.starCoins * 4
    expect(starsWaiting(state)).toBe(2)
    expect(nextStarAt(state)).toBe(QUIET.starCoins * 9)
  })

  it('counts coins earned in this run toward stars', () => {
    const state = createSim(QUIET, 1)
    fillRedJar(state)
    expect(state.runEarned).toBe(state.earned)
    expect(state.runEarned).toBeGreaterThan(0)
  })

  it('keeps stars, marbles and totals, and starts coins and upgrades again', () => {
    const state = createSim({ ...QUIET, rushHits: 1 }, 1)
    sortByHand(state)
    Object.assign(state, { coins: 5000, earned: 90_000, runEarned: QUIET.starCoins * 9, stars: 2, shelved: 400, ordersDone: 12 })
    const oldOrders = state.orders
    state.upgrades.lids = 4
    state.upgrades.spotter = 1
    state.collection.oxblood = 3
    state.orders[0].have = 1

    expect(prestige(state)).toBe(3)
    expect(state.stars).toBe(5)
    expect(state.coins).toBe(0)
    expect(state.runEarned).toBe(0)
    expect(Object.values(state.upgrades).every((level) => level === 0)).toBe(true)
    expect(state.rushLeft).toBe(0)
    expect(state.rushCharge).toBe(0)
    expect(state.orders).not.toBe(oldOrders)
    expect(state.orders).toHaveLength(QUIET.orderSlots)
    expect(state.orders.every((o) => o.have === 0)).toBe(true)
    expect(state.earned).toBe(90_000)
    expect(state.shelved).toBe(400)
    expect(state.ordersDone).toBe(12)
    expect(state.collection.oxblood).toBe(3)
  })

  it('pays finished orders first, so nothing waiting to be claimed is lost', () => {
    const state = createSim(QUIET, 1)
    state.runEarned = QUIET.starCoins * 4 - 10 // one star, ten coins short of the second
    state.orders = [order('hand', 1, { have: 1, worth: 6 }), order('catch', 1), order('jars', 5)]
    expect(prestige(state)).toBe(2)
    expect(state.ordersDone).toBe(1)
    expect(state.earned).toBe(6 * QUIET.jarCoins)
  })

  it('changes nothing when no star is waiting', () => {
    const state = createSim(QUIET, 1)
    state.coins = 300
    state.upgrades.belt = 2
    expect(prestige(state)).toBe(0)
    expect(state.coins).toBe(300)
    expect(state.upgrades.belt).toBe(2)
  })

  it('pays more for everything with each star', () => {
    const state = createSim(QUIET, 1)
    state.stars = 2
    const events = fillRedJar(state)
    expect(ofType(events, 'jarFull')[0].coins).toBe(Math.round(QUIET.jarCoins * (1 + 2 * QUIET.starBonus)))
    expect(ofType(events, 'sorted')[0].coins).toBe(Math.round(QUIET.handTip * (1 + 2 * QUIET.starBonus)))
    expect(orderReward(state, order('jars', 10, { worth: 10 }))).toBe(Math.round(10 * QUIET.jarCoins * (1 + 2 * QUIET.starBonus)))
  })
})

describe('saving the all-day loop', () => {
  function played(): SimState {
    const state = createSim(DEFAULT_CONFIG, 1)
    Object.assign(state, { coins: 432, earned: 9000, runEarned: 2500, stars: 3, ordersDone: 8, rushCharge: 11 })
    state.orders = [order('jars', 30, { have: 12, worth: 15 }), order('colour', 9, { have: 9, colour: 'blue', worth: 13.5 }), order('catch', 2, { worth: 16 })]
    return state
  }

  it('brings back stars, the run so far, the orders and the rush meter', () => {
    const data = parseSave(JSON.parse(JSON.stringify(toSave(played(), NOW))))!
    const { state } = resume(DEFAULT_CONFIG, 1, data, NOW + 5_000)
    expect(state).toMatchObject({ stars: 3, runEarned: 2500, ordersDone: 8, rushCharge: 11 })
    expect(state.orders).toEqual(played().orders)
  })

  it('reads a save from before the loop: the whole of it counts as the first run', () => {
    const { stars, runEarned, ordersDone, orders, rushCharge, ...old } = toSave(played(), NOW)
    const { state } = resume(DEFAULT_CONFIG, 1, parseSave(old)!, NOW + 5_000)
    expect(state.stars).toBe(0)
    expect(state.runEarned).toBe(9000)
    expect(state.ordersDone).toBe(0)
    expect(state.orders).toEqual(createSim(DEFAULT_CONFIG, 1).orders)
  })

  it('replaces orders that make no sense with new ones', () => {
    const data = parseSave({ ...toSave(played(), NOW), orders: [{ kind: 'bogus', need: 3, have: 0, worth: 1 }, { kind: 'jars', need: -2 }, 'x'], rushCharge: 1e9 })!
    const { state } = resume(DEFAULT_CONFIG, 1, data, NOW + 5_000)
    expect(state.orders).toEqual(createSim(DEFAULT_CONFIG, 1).orders)
    expect(state.rushCharge).toBeLessThan(DEFAULT_CONFIG.rushHits)
  })

  it('deals new orders whenever one in the save cannot be read', () => {
    const fine = order('jars', 5)
    const bad: unknown[] = [
      'x',
      [fine, fine],
      [fine, fine, fine, fine],
      [fine, fine, null],
      [fine, fine, { ...fine, need: 0 }],
      [fine, fine, { ...fine, need: 'many' }],
      [fine, fine, { ...fine, worth: -1 }],
      [fine, fine, { ...fine, worth: Number.NaN }],
      [fine, fine, { ...fine, worth: 1e99 }],
      [fine, fine, { ...fine, kind: 'colour', colour: '__proto__' }],
    ]
    for (const orders of bad) {
      const { state } = resume(DEFAULT_CONFIG, 1, parseSave({ ...toSave(played(), NOW), orders })!, NOW + 5_000)
      expect(state.orders, JSON.stringify(orders)).toEqual(createSim(DEFAULT_CONFIG, 1).orders)
    }
  })

  it('carries a rush in progress through a reload, and never a longer one than the line can have', () => {
    const rushing = played()
    rushing.rushLeft = 6.5
    const back = resume(DEFAULT_CONFIG, 1, parseSave(JSON.parse(JSON.stringify(toSave(rushing, NOW))))!, NOW + 5_000).state
    expect(back.rushLeft).toBe(6.5)
    for (const rushLeft of [1e9, -4, Number.NaN, 'long', null]) {
      const { state } = resume(DEFAULT_CONFIG, 1, parseSave({ ...toSave(played(), NOW), rushLeft })!, NOW + 5_000)
      expect(state.rushLeft).toBeGreaterThanOrEqual(0)
      expect(state.rushLeft).toBeLessThanOrEqual(DEFAULT_CONFIG.rushSeconds)
    }
  })

  it('repairs progress past the end of an order and a colour that is not on the line', () => {
    const data = parseSave({
      ...toSave(played(), NOW),
      orders: [{ kind: 'jars', need: 5, have: 99, worth: 2 }, { kind: 'colour', colour: 'green', need: 5, have: 0, worth: 2 }, { kind: 'hand', need: 5, have: 0, worth: 2 }],
    })!
    expect(data.orders).toBeNull()
    const good = parseSave({ ...toSave(played(), NOW), orders: [order('jars', 5, { have: 99 }), order('hand', 5), order('catch', 1)] })!
    expect(good.orders![0].have).toBe(5)
  })
})

describe('time away and the loop', () => {
  it('pays stars and mastery on jars filled while away', () => {
    const state = createSim(DEFAULT_CONFIG, 1)
    const plain = awayEarnings(state, 3600)
    state.stars = 4
    expect(awayEarnings(state, 3600)).toEqual({ jars: plain.jars, coins: plain.jars * Math.round(DEFAULT_CONFIG.jarCoins * 1.6) })
    state.collection.galaxy = MASTERY_AT[3] // gold legendary: +24%
    expect(awayEarnings(state, 3600).coins).toBe(plain.jars * Math.round(DEFAULT_CONFIG.jarCoins * 1.6 * 1.24))
  })

  it('pays the same for a jar filled while away as for one filled while watching', () => {
    for (let lids = 0; lids <= 40; lids++) {
      for (let stars = 0; stars <= 30; stars++) {
        const state = createSim(QUIET, 1)
        state.upgrades.lids = lids
        state.stars = stars
        const away = steadyJarPay(state)
        expect(ofType(fillRedJar(state), 'jarFull')[0].coins, `lids ${lids}, stars ${stars}`).toBe(away)
      }
    }
  })

  it('counts the jars toward orders and the run, so there is something to claim on return', () => {
    const state = createSim(DEFAULT_CONFIG, 1)
    state.orders = [order('jars', 50), order('colour', 400, { colour: 'red' }), order('hand', 20)]
    const paid = payAway(state, 3600)! // 600 jars, 200 of each colour
    expect(state.orders.map((o) => o.have)).toEqual([50, 200, 0])
    expect(state.runEarned).toBe(paid.coins)
  })
})

describe('the warm-up before the first frame', () => {
  const RARES_EVERYWHERE: SimConfig = { ...DEFAULT_CONFIG, rareChance: 1, startShelved: 0 }

  it('gets the line going without earning, moving an order or dealing a rare marble', () => {
    const state = createSim(RARES_EVERYWHERE, 3)
    state.upgrades.spotter = 1
    const orders = structuredClone(state.orders)
    let steps = 0
    warmUp(state, 8, 1 / 32, () => steps++)
    expect(steps).toBe(8 * 32)
    expect(state.items.length).toBeGreaterThan(5)
    expect(state.items.some((item) => item.rare)).toBe(false)
    expect(state.recycle.some((kind) => kind.rare)).toBe(false)
    expect(state).toMatchObject({ coins: 0, earned: 0, runEarned: 0, collection: {} })
    expect(state.orders).toEqual(orders)
    expect(state.config).toBe(RARES_EVERYWHERE) // and the line deals rare marbles again afterwards
    expect(state.upgrades.spotter).toBe(1)
  })
})
